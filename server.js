require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const {
    initDatabase,
    adminQueries,
    studentQueries,
    buttonQueries,
    weekQueries,
    scoreQueries,
    importQueries
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
initDatabase();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy (required for Railway, Render, etc.)
app.set('trust proxy', 1);

// Session configuration - production ready
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
    name: 'emulation_session',
    secret: process.env.SESSION_SECRET || 'emulation-tracker-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: isProduction ? 'none' : 'lax' // 'none' for cross-site cookies in production
    }
}));

// Auth middleware
const requireAdmin = (req, res, next) => {
    if (req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

const requireUser = (req, res, next) => {
    if (req.session.student) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// ============ AUTH ROUTES ============

// Admin login
app.post('/api/auth/admin/login', (req, res) => {
    const { username, password } = req.body;
    const admin = adminQueries.login(username, password);
    if (admin) {
        req.session.admin = admin;
        res.json({ success: true, admin });
    } else {
        res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }
});

// Student login
app.post('/api/auth/student/login', (req, res) => {
    const { studentCode } = req.body;
    const student = studentQueries.getByCode(studentCode);
    if (student) {
        req.session.student = { id: student.id }; // Only store ID, fetch fresh data when needed
        res.json({ success: true, student });
    } else {
        res.status(401).json({ error: 'Mã số học sinh không tồn tại' });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Check session
app.get('/api/auth/session', (req, res) => {
    if (req.session.admin) {
        res.json({ type: 'admin', user: req.session.admin });
    } else if (req.session.student) {
        res.json({ type: 'student', user: req.session.student });
    } else {
        res.json({ type: null });
    }
});

// ============ STUDENT ROUTES (Admin) ============

app.get('/api/students', requireAdmin, (req, res) => {
    res.json(studentQueries.getAll());
});

app.post('/api/students', requireAdmin, (req, res) => {
    const { name, student_code } = req.body;
    try {
        const id = studentQueries.create(name, student_code);
        res.json({ success: true, id });
    } catch (err) {
        res.status(400).json({ error: 'Mã số học sinh đã tồn tại' });
    }
});

app.put('/api/students/:id', requireAdmin, (req, res) => {
    const { name, student_code } = req.body;
    try {
        studentQueries.update(req.params.id, name, student_code);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Mã số học sinh đã tồn tại' });
    }
});

app.delete('/api/students/:id', requireAdmin, (req, res) => {
    studentQueries.delete(req.params.id);
    res.json({ success: true });
});

app.post('/api/students/reset-points', requireAdmin, (req, res) => {
    studentQueries.resetAllPoints();
    res.json({ success: true });
});

// ============ PRESET BUTTON ROUTES ============

app.get('/api/buttons', requireAdmin, (req, res) => {
    res.json(buttonQueries.getAll());
});

app.post('/api/buttons', requireAdmin, (req, res) => {
    const { name, points, type } = req.body;
    const id = buttonQueries.create(name, parseInt(points), type);
    res.json({ success: true, id });
});

app.delete('/api/buttons/:id', requireAdmin, (req, res) => {
    buttonQueries.delete(req.params.id);
    res.json({ success: true });
});

// ============ WEEK ROUTES ============

app.get('/api/weeks', requireAdmin, (req, res) => {
    res.json(weekQueries.getAll());
});

app.post('/api/weeks', requireAdmin, (req, res) => {
    const { name } = req.body;
    const id = weekQueries.create(name);
    res.json({ success: true, id });
});

app.post('/api/weeks/:id/activate', requireAdmin, (req, res) => {
    weekQueries.setActive(req.params.id);
    res.json({ success: true });
});

app.delete('/api/weeks/:id', requireAdmin, (req, res) => {
    weekQueries.delete(req.params.id);
    res.json({ success: true });
});

// Public weeks for overview
app.get('/api/weeks/public', (req, res) => {
    res.json(weekQueries.getAll());
});

// Overview endpoint
app.get('/api/overview/:weekId', (req, res) => {
    const weekId = req.params.weekId;
    const weeks = weekQueries.getAll();
    const week = weeks.find(w => w.id == weekId);
    const records = scoreQueries.getByWeek(weekId);
    res.json({ week, records });
});

// ============ SCORE ROUTES ============

app.post('/api/scores', requireAdmin, (req, res) => {
    const { student_id, button_id, week_id, points, note, violation_date } = req.body;
    const id = scoreQueries.create(student_id, button_id, week_id, points, note, violation_date);
    res.json({ success: true, id });
});

app.get('/api/scores/student/:id', requireAdmin, (req, res) => {
    res.json(scoreQueries.getByStudent(req.params.id));
});

app.get('/api/scores/week/:id', requireAdmin, (req, res) => {
    res.json(scoreQueries.getByWeek(req.params.id));
});

app.delete('/api/scores/:id', requireAdmin, (req, res) => {
    scoreQueries.delete(req.params.id);
    res.json({ success: true });
});

app.get('/api/scores/all', requireAdmin, (req, res) => {
    res.json(scoreQueries.getAll());
});

// ============ LEADERBOARD ============

app.get('/api/leaderboard', (req, res) => {
    res.json(studentQueries.getLeaderboard());
});

// ============ IMPORT ROUTES ============

app.post('/api/import/students', requireAdmin, (req, res) => {
    const { students } = req.body;
    try {
        importQueries.importStudents(students);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/import/scores', requireAdmin, (req, res) => {
    const { records, week_id } = req.body;
    try {
        importQueries.importScores(records, week_id);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ============ USER ROUTES ============

app.get('/api/user/profile', requireUser, (req, res) => {
    const student = studentQueries.getById(req.session.student.id);
    const leaderboard = studentQueries.getLeaderboard();
    const rank = leaderboard.findIndex(s => s.id === student.id) + 1;
    res.json({ ...student, rank, total: leaderboard.length });
});

app.get('/api/user/history', requireUser, (req, res) => {
    res.json(scoreQueries.getByStudent(req.session.student.id));
});

// ============ SERVE HTML ============

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/user', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

app.get('/overview', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overview.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 Admin: http://localhost:${PORT}/admin`);
    console.log(`👤 User: http://localhost:${PORT}/user`);
});

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const {
    initDatabase,
    adminQueries,
    studentQueries,
    buttonQueries,
    weekQueries,
    scoreQueries
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initDatabase();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy (required for Railway, Render, etc.)
app.set('trust proxy', 1);

// Session configuration - simple
app.use(session({
    secret: process.env.SESSION_SECRET || 'emulation-tracker-secret',
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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

app.post('/api/auth/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await adminQueries.login(username, password);
        if (admin) {
            req.session.admin = admin;
            res.json({ success: true, admin });
        } else {
            res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/student/login', async (req, res) => {
    try {
        const { studentCode } = req.body;
        const student = await studentQueries.getByCode(studentCode);
        if (student) {
            req.session.student = { id: student.id };
            res.json({ success: true, student });
        } else {
            res.status(401).json({ error: 'Mã số học sinh không tồn tại' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
    res.json({
        admin: !!req.session.admin,
        student: !!req.session.student
    });
});

app.get('/api/auth/session', (req, res) => {
    if (req.session.admin) {
        res.json({ type: 'admin', admin: req.session.admin });
    } else if (req.session.student) {
        res.json({ type: 'student', student: req.session.student });
    } else {
        res.json({ type: null });
    }
});

app.post('/api/auth/change-password', requireAdmin, async (req, res) => {
    try {
        const { newPassword } = req.body;
        await adminQueries.changePassword(req.session.admin.id, newPassword);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ STUDENT ROUTES ============

app.get('/api/students', requireAdmin, async (req, res) => {
    try {
        res.json(await studentQueries.getAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/students', requireAdmin, async (req, res) => {
    try {
        const { name, student_code } = req.body;
        const id = await studentQueries.create(name, student_code);
        res.json({ success: true, id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/students/:id', requireAdmin, async (req, res) => {
    try {
        await studentQueries.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ BUTTON ROUTES ============

app.get('/api/buttons', requireAdmin, async (req, res) => {
    try {
        res.json(await buttonQueries.getAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/buttons', requireAdmin, async (req, res) => {
    try {
        const { name, points, type } = req.body;
        const id = await buttonQueries.create(name, points, type);
        res.json({ success: true, id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/buttons/:id', requireAdmin, async (req, res) => {
    try {
        await buttonQueries.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ WEEK ROUTES ============

app.get('/api/weeks', requireAdmin, async (req, res) => {
    try {
        res.json(await weekQueries.getAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/weeks', requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        const id = await weekQueries.create(name);
        res.json({ success: true, id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/weeks/:id', requireAdmin, async (req, res) => {
    try {
        await weekQueries.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/weeks/public', async (req, res) => {
    try {
        res.json(await weekQueries.getAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/overview/:weekNum', async (req, res) => {
    try {
        const weekNum = parseInt(req.params.weekNum);
        const week = await weekQueries.getByWeekNumber(weekNum);

        if (!week) {
            return res.json({ week: null, records: [] });
        }

        const records = await scoreQueries.getByWeek(week._id);
        res.json({
            week: { id: week._id, name: week.name, weekNumber: week.weekNumber },
            records
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ SCORE ROUTES ============

app.post('/api/scores', requireAdmin, async (req, res) => {
    try {
        const { student_id, button_id, week_id, points, note, violation_date } = req.body;
        const id = await scoreQueries.create(student_id, button_id, week_id, points, note, violation_date);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/scores/student/:id', requireAdmin, async (req, res) => {
    try {
        res.json(await scoreQueries.getByStudent(req.params.id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/scores/week/:id', requireAdmin, async (req, res) => {
    try {
        res.json(await scoreQueries.getByWeek(req.params.id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/scores/:id', requireAdmin, async (req, res) => {
    try {
        await scoreQueries.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/scores/all', requireAdmin, async (req, res) => {
    try {
        res.json(await scoreQueries.getAll());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/scores/all', requireAdmin, async (req, res) => {
    try {
        console.log('Deleting all scores...');
        const count = await scoreQueries.deleteAll();
        console.log('Deleted count:', count);
        console.log('Resetting all points...');
        await studentQueries.resetAllPoints();
        console.log('Points reset done');
        res.json({ success: true, deleted: count });
    } catch (err) {
        console.error('Delete all scores error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ LEADERBOARD ============

app.get('/api/leaderboard', async (req, res) => {
    try {
        res.json(await studentQueries.getLeaderboard());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reset-points', requireAdmin, async (req, res) => {
    try {
        await studentQueries.resetAllPoints();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ IMPORT ============

app.post('/api/import/students', requireAdmin, async (req, res) => {
    try {
        const { students } = req.body;
        let imported = 0;
        for (const s of students) {
            try {
                await studentQueries.create(s.name, s.student_code);
                imported++;
            } catch (e) {
                // Skip duplicates
            }
        }
        res.json({ success: true, imported });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ============ USER ROUTES ============

app.get('/api/user/profile', requireUser, async (req, res) => {
    try {
        const student = await studentQueries.getById(req.session.student.id);
        const leaderboard = await studentQueries.getLeaderboard();
        const rank = leaderboard.findIndex(s => s.id.toString() === student.id.toString()) + 1;
        res.json({ ...student, rank, total: leaderboard.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/history', requireUser, async (req, res) => {
    try {
        res.json(await scoreQueries.getByStudent(req.session.student.id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

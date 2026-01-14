const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
async function initDatabase() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/emulation-tracker';

    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Create default admin if not exists
        const adminCount = await Admin.countDocuments();
        if (adminCount === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await Admin.create({ username: 'admin', password: hashedPassword });
            console.log('👤 Default admin created (admin/admin123)');
        }
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    }
}

// ============ SCHEMAS ============

const adminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}, { timestamps: true });

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    student_code: { type: String, unique: true, required: true },
    points: { type: Number, default: 100 }
}, { timestamps: true });

const buttonSchema = new mongoose.Schema({
    name: { type: String, required: true },
    points: { type: Number, required: true },
    type: { type: String, enum: ['bonus', 'penalty'], required: true }
}, { timestamps: true });

const weekSchema = new mongoose.Schema({
    name: { type: String, required: true },
    weekNumber: { type: Number, unique: true, sparse: true }
}, { timestamps: true });

const scoreRecordSchema = new mongoose.Schema({
    student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    button_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Button' },
    week_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Week' },
    points: { type: Number, required: true },
    note: { type: String },
    violation_date: { type: Date }
}, { timestamps: true });

// ============ MODELS ============

const Admin = mongoose.model('Admin', adminSchema);
const Student = mongoose.model('Student', studentSchema);
const Button = mongoose.model('Button', buttonSchema);
const Week = mongoose.model('Week', weekSchema);
const ScoreRecord = mongoose.model('ScoreRecord', scoreRecordSchema);

// ============ ADMIN QUERIES ============

const adminQueries = {
    login: async (username, password) => {
        const admin = await Admin.findOne({ username });
        if (admin && bcrypt.compareSync(password, admin.password)) {
            return { id: admin._id, username: admin.username };
        }
        return null;
    },
    changePassword: async (id, newPassword) => {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await Admin.findByIdAndUpdate(id, { password: hashedPassword });
    }
};

// ============ STUDENT QUERIES ============

const studentQueries = {
    getAll: async () => {
        const students = await Student.find().sort({ name: 1 });
        return students.map(s => ({
            id: s._id,
            name: s.name,
            student_code: s.student_code,
            points: s.points
        }));
    },
    getById: async (id) => {
        const s = await Student.findById(id);
        if (!s) return null;
        return { id: s._id, name: s.name, student_code: s.student_code, points: s.points };
    },
    getByCode: async (code) => {
        const s = await Student.findOne({ student_code: String(code) });
        if (!s) return null;
        return { id: s._id, name: s.name, student_code: s.student_code, points: s.points };
    },
    create: async (name, studentCode) => {
        const student = await Student.create({ name, student_code: String(studentCode) });
        return student._id;
    },
    updatePoints: async (id, newPoints) => {
        await Student.findByIdAndUpdate(id, { points: newPoints });
    },
    delete: async (id) => {
        await Student.findByIdAndDelete(id);
        await ScoreRecord.deleteMany({ student_id: id });
    },
    getLeaderboard: async () => {
        const students = await Student.find().sort({ points: -1, student_code: 1 });
        return students.map(s => ({
            id: s._id,
            name: s.name,
            student_code: s.student_code,
            points: s.points
        }));
    },
    resetAllPoints: async () => {
        await Student.updateMany({}, { points: 100 });
    }
};

// ============ BUTTON QUERIES ============

const buttonQueries = {
    getAll: async () => {
        const buttons = await Button.find().sort({ type: 1, name: 1 });
        return buttons.map(b => ({
            id: b._id,
            name: b.name,
            points: b.points,
            type: b.type
        }));
    },
    create: async (name, points, type) => {
        const button = await Button.create({ name, points, type });
        return button._id;
    },
    delete: async (id) => {
        await Button.findByIdAndDelete(id);
    }
};

// ============ WEEK QUERIES ============

const weekQueries = {
    getAll: async () => {
        const weeks = await Week.find().sort({ weekNumber: 1, createdAt: 1 });
        return weeks.map((w, index) => ({
            id: w._id,
            name: w.name,
            weekNumber: w.weekNumber || index + 1
        }));
    },
    getByWeekNumber: async (weekNumber) => {
        const week = await Week.findOne({ weekNumber: parseInt(weekNumber) });
        return week;
    },
    create: async (name) => {
        // Extract number from name like "Tuần 5" -> 5
        const match = name.match(/\d+/);
        const weekNumber = match ? parseInt(match[0]) : null;

        const week = await Week.create({ name, weekNumber });
        return week._id;
    },
    delete: async (id) => {
        await Week.findByIdAndDelete(id);
        await ScoreRecord.deleteMany({ week_id: id });
    }
};

// ============ SCORE QUERIES ============

const scoreQueries = {
    create: async (studentId, buttonId, weekId, points, note, violationDate) => {
        const record = await ScoreRecord.create({
            student_id: studentId,
            button_id: buttonId || null,
            week_id: weekId || null,
            points,
            note: note || null,
            violation_date: violationDate || null
        });

        // Update student points
        const student = await Student.findById(studentId);
        if (student) {
            await Student.findByIdAndUpdate(studentId, { points: student.points + points });
        }

        return record._id;
    },
    getByStudent: async (studentId) => {
        const records = await ScoreRecord.find({ student_id: studentId })
            .populate('button_id', 'name')
            .populate('week_id', 'name')
            .sort({ createdAt: -1 });

        return records.map(r => ({
            id: r._id,
            points: r.points,
            note: r.note,
            violation_date: r.violation_date,
            button_name: r.button_id?.name,
            week_name: r.week_id?.name,
            created_at: r.createdAt
        }));
    },
    getByWeek: async (weekId) => {
        const records = await ScoreRecord.find({ week_id: weekId })
            .populate('student_id', 'name student_code')
            .populate('button_id', 'name')
            .sort({ createdAt: -1 });

        return records.map(r => ({
            id: r._id,
            student_id: r.student_id?._id,
            student_name: r.student_id?.name,
            student_code: r.student_id?.student_code,
            points: r.points,
            note: r.note,
            violation_date: r.violation_date,
            button_name: r.button_id?.name
        }));
    },
    getAll: async () => {
        const records = await ScoreRecord.find()
            .populate('student_id', 'name student_code')
            .populate('button_id', 'name')
            .populate('week_id', 'name')
            .sort({ createdAt: -1 });

        return records.map(r => ({
            id: r._id,
            student_id: r.student_id?._id,
            student_name: r.student_id?.name,
            student_code: r.student_id?.student_code,
            points: r.points,
            note: r.note,
            violation_date: r.violation_date,
            button_name: r.button_id?.name,
            week_name: r.week_id?.name
        }));
    },
    delete: async (id) => {
        const record = await ScoreRecord.findById(id);
        if (record) {
            // Reverse the points
            const student = await Student.findById(record.student_id);
            if (student) {
                await Student.findByIdAndUpdate(record.student_id, {
                    points: student.points - record.points
                });
            }
            await ScoreRecord.findByIdAndDelete(id);
        }
    },
    deleteAll: async () => {
        const result = await ScoreRecord.deleteMany({});
        console.log('Deleted scores:', result.deletedCount);
        return result.deletedCount;
    }
};

module.exports = {
    initDatabase,
    adminQueries,
    studentQueries,
    buttonQueries,
    weekQueries,
    scoreQueries,
    // Export models directly
    models: { Admin, Student, Button, Week, ScoreRecord }
};

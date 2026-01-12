const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let db = null;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'emulation.db');

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log('📁 Created data directory');
    }

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            student_code TEXT UNIQUE NOT NULL,
            points REAL DEFAULT 100,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS preset_buttons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            points REAL NOT NULL,
            type TEXT CHECK(type IN ('bonus', 'penalty')) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS weeks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date DATE,
            end_date DATE,
            is_active INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS score_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            button_id INTEGER,
            week_id INTEGER,
            points REAL NOT NULL,
            note TEXT,
            violation_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(id),
            FOREIGN KEY (button_id) REFERENCES preset_buttons(id),
            FOREIGN KEY (week_id) REFERENCES weeks(id)
        )
    `);

    // Try to add violation_date column if table already exists
    try {
        db.run("ALTER TABLE score_records ADD COLUMN violation_date DATE");
    } catch (e) { }

    // Create default admin if not exists
    const adminExists = db.exec("SELECT * FROM admin WHERE username = 'admin'");
    if (adminExists.length === 0 || adminExists[0].values.length === 0) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO admin (username, password) VALUES (?, ?)", ['admin', hashedPassword]);
    }

    // Create some default preset buttons
    const buttonsExist = db.exec("SELECT COUNT(*) as count FROM preset_buttons");
    if (buttonsExist.length === 0 || buttonsExist[0].values[0][0] === 0) {
        const defaultButtons = [
            { name: 'Đi muộn', points: -5, type: 'penalty' },
            { name: 'Không làm BTVN', points: -10, type: 'penalty' },
            { name: 'Nói chuyện trong giờ', points: -5, type: 'penalty' },
            { name: 'Không mặc đồng phục', points: -10, type: 'penalty' },
            { name: 'Giúp đỡ bạn', points: 5, type: 'bonus' },
            { name: 'Phát biểu tốt', points: 5, type: 'bonus' },
            { name: 'Điểm 10', points: 10, type: 'bonus' },
            { name: 'Hoạt động tích cực', points: 10, type: 'bonus' }
        ];
        defaultButtons.forEach(btn => {
            db.run("INSERT INTO preset_buttons (name, points, type) VALUES (?, ?, ?)", [btn.name, btn.points, btn.type]);
        });
    }

    saveDatabase();
    console.log('✅ Database initialized');
}

// Save database to file
function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Helper to convert result to object array
function resultToArray(result, columns) {
    if (!result || result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map(row => {
        const obj = {};
        cols.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
}

// Admin functions
const adminQueries = {
    login: (username, password) => {
        const result = db.exec("SELECT * FROM admin WHERE username = ?", [username]);
        if (result.length > 0 && result[0].values.length > 0) {
            const row = result[0].values[0];
            const cols = result[0].columns;
            const admin = {};
            cols.forEach((col, i) => admin[col] = row[i]);

            if (bcrypt.compareSync(password, admin.password)) {
                return { id: admin.id, username: admin.username };
            }
        }
        return null;
    }
};

// Student functions
const studentQueries = {
    getAll: () => {
        const result = db.exec("SELECT * FROM students ORDER BY name");
        return resultToArray(result);
    },
    getById: (id) => {
        const result = db.exec("SELECT * FROM students WHERE id = ?", [id]);
        const arr = resultToArray(result);
        return arr.length > 0 ? arr[0] : null;
    },
    getByCode: (code) => {
        const result = db.exec("SELECT * FROM students WHERE student_code = ?", [code]);
        const arr = resultToArray(result);
        return arr.length > 0 ? arr[0] : null;
    },
    create: (name, code) => {
        db.run("INSERT INTO students (name, student_code) VALUES (?, ?)", [name, code]);
        saveDatabase();
        const result = db.exec("SELECT last_insert_rowid() as id");
        return result[0].values[0][0];
    },
    update: (id, name, code) => {
        db.run("UPDATE students SET name = ?, student_code = ? WHERE id = ?", [name, code, id]);
        saveDatabase();
    },
    delete: (id) => {
        db.run("DELETE FROM score_records WHERE student_id = ?", [id]);
        db.run("DELETE FROM students WHERE id = ?", [id]);
        saveDatabase();
    },
    updatePoints: (id, points) => {
        db.run("UPDATE students SET points = ? WHERE id = ?", [points, id]);
        saveDatabase();
    },
    resetAllPoints: () => {
        db.run("UPDATE students SET points = 100");
        saveDatabase();
    },
    getLeaderboard: () => {
        const result = db.exec("SELECT * FROM students ORDER BY points DESC");
        return resultToArray(result);
    }
};

// Preset button functions
const buttonQueries = {
    getAll: () => {
        const result = db.exec("SELECT * FROM preset_buttons ORDER BY type, name");
        return resultToArray(result);
    },
    getByType: (type) => {
        const result = db.exec("SELECT * FROM preset_buttons WHERE type = ? ORDER BY name", [type]);
        return resultToArray(result);
    },
    create: (name, points, type) => {
        db.run("INSERT INTO preset_buttons (name, points, type) VALUES (?, ?, ?)", [name, points, type]);
        saveDatabase();
        const result = db.exec("SELECT last_insert_rowid() as id");
        return result[0].values[0][0];
    },
    delete: (id) => {
        db.run("DELETE FROM preset_buttons WHERE id = ?", [id]);
        saveDatabase();
    }
};

// Week functions
const weekQueries = {
    getAll: () => {
        const result = db.exec("SELECT * FROM weeks ORDER BY id DESC");
        return resultToArray(result);
    },
    getActive: () => {
        const result = db.exec("SELECT * FROM weeks WHERE is_active = 1");
        const arr = resultToArray(result);
        return arr.length > 0 ? arr[0] : null;
    },
    create: (name) => {
        db.run("INSERT INTO weeks (name) VALUES (?)", [name]);
        saveDatabase();
        const result = db.exec("SELECT last_insert_rowid() as id");
        return result[0].values[0][0];
    },
    setActive: (id) => {
        db.run("UPDATE weeks SET is_active = 0");
        db.run("UPDATE weeks SET is_active = 1 WHERE id = ?", [id]);
        saveDatabase();
    },
    delete: (id) => {
        db.run("DELETE FROM score_records WHERE week_id = ?", [id]);
        db.run("DELETE FROM weeks WHERE id = ?", [id]);
        saveDatabase();
    }
};

// Score record functions
const scoreQueries = {
    create: (studentId, buttonId, weekId, points, note, violationDate) => {
        db.run(
            "INSERT INTO score_records (student_id, button_id, week_id, points, note, violation_date) VALUES (?, ?, ?, ?, ?, ?)",
            [studentId, buttonId, weekId, points, note, violationDate]
        );

        // Update student total points
        const student = studentQueries.getById(studentId);
        studentQueries.updatePoints(studentId, student.points + points);

        const result = db.exec("SELECT last_insert_rowid() as id");
        return result[0].values[0][0];
    },
    getByStudent: (studentId) => {
        const result = db.exec(`
            SELECT sr.*, pb.name as button_name, w.name as week_name
            FROM score_records sr
            LEFT JOIN preset_buttons pb ON sr.button_id = pb.id
            LEFT JOIN weeks w ON sr.week_id = w.id
            WHERE sr.student_id = ?
            ORDER BY sr.created_at DESC
        `, [studentId]);
        return resultToArray(result);
    },
    getByWeek: (weekId) => {
        const result = db.exec(`
            SELECT sr.*, s.name as student_name, s.student_code, pb.name as button_name
            FROM score_records sr
            JOIN students s ON sr.student_id = s.id
            LEFT JOIN preset_buttons pb ON sr.button_id = pb.id
            WHERE sr.week_id = ?
            ORDER BY sr.created_at DESC
        `, [weekId]);
        return resultToArray(result);
    },
    delete: (id) => {
        const result = db.exec("SELECT * FROM score_records WHERE id = ?", [id]);
        const records = resultToArray(result);
        if (records.length > 0) {
            const record = records[0];
            const student = studentQueries.getById(record.student_id);
            studentQueries.updatePoints(record.student_id, student.points - record.points);
            db.run("DELETE FROM score_records WHERE id = ?", [id]);
            saveDatabase();
        }
    },
    getAll: () => {
        const result = db.exec(`
            SELECT sr.*, s.name as student_name, s.student_code, pb.name as button_name, w.name as week_name
            FROM score_records sr
            JOIN students s ON sr.student_id = s.id
            LEFT JOIN preset_buttons pb ON sr.button_id = pb.id
            LEFT JOIN weeks w ON sr.week_id = w.id
            ORDER BY sr.created_at DESC
        `);
        return resultToArray(result);
    }
};

// Import functions
const importQueries = {
    importStudents: (students) => {
        students.forEach(s => {
            try {
                db.run("INSERT OR IGNORE INTO students (name, student_code) VALUES (?, ?)",
                    [s.name, s.student_code || s.code]);
            } catch (e) { }
        });
        saveDatabase();
    },
    importScores: (records, weekId) => {
        records.forEach(r => {
            const student = studentQueries.getByCode(r.student_code);
            if (student) {
                db.run(
                    "INSERT INTO score_records (student_id, points, week_id, note) VALUES (?, ?, ?, ?)",
                    [student.id, r.points, weekId, r.note || 'Import']
                );
                studentQueries.updatePoints(student.id, student.points + r.points);
            }
        });
        saveDatabase();
    }
};

module.exports = {
    initDatabase,
    adminQueries,
    studentQueries,
    buttonQueries,
    weekQueries,
    scoreQueries,
    importQueries
};

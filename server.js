const express = require('express'), Database = require('better-sqlite3'), crypto = require('crypto'), path = require('path');
const app = express(), db = new Database(process.env.DB_PATH || 'placement.db');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- DATABASE ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT, branch TEXT, cgpa REAL);
CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, company TEXT, title TEXT, location TEXT, package TEXT, min_cgpa REAL, deadline TEXT, description TEXT);
CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), job_id INTEGER REFERENCES jobs(id), status TEXT DEFAULT 'Applied', applied_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, job_id));
`);
const hash = p => { const s = crypto.randomBytes(8).toString('hex'); return s + ':' + crypto.scryptSync(p, s, 32).toString('hex'); };
const verify = (p, h) => { const [s, k] = h.split(':'); return crypto.scryptSync(p, s, 32).toString('hex') === k; };

if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) {
  const u = db.prepare('INSERT INTO users(name,email,password,role,branch,cgpa) VALUES(?,?,?,?,?,?)');
  u.run('TPO Admin', 'admin@college.edu', hash('admin123'), 'admin', null, null);
  u.run('Rahul Sharma', 'rahul@student.edu', hash('student123'), 'student', 'CSE', 8.2);
  const j = db.prepare('INSERT INTO jobs(company,title,location,package,min_cgpa,deadline,description) VALUES(?,?,?,?,?,?,?)');
  [['TCS','Systems Engineer','Indore','₹7 LPA',6,'2026-11-30','Build and support enterprise software for global clients.'],
   ['Infosys','Software Developer','Pune','₹6.5 LPA',6.5,'2026-12-05','Full-stack development on cloud-native products.'],
   ['Zoho','Member Technical Staff','Chennai','₹9 LPA',7.5,'2026-12-10','Work on in-house products used by millions.'],
   ['Persistent','Backend Engineer','Nagpur','₹8 LPA',7,'2026-12-15','Design APIs and data pipelines in Node.js and Java.'],
   ['Wipro','Data Analyst','Bengaluru','₹5.5 LPA',6,'2026-12-20','Turn business data into dashboards and decisions.']]
   .forEach(r => j.run(...r));
  db.prepare("INSERT INTO applications(user_id,job_id,status) VALUES(2,1,'Shortlisted')").run();
}

// ---------- AUTH ----------
const sessions = new Map();
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, branch: u.branch, cgpa: u.cgpa });
const session = u => { const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, u); return { token: t, user: pub(u) }; };
const auth = role => (q, s, n) => {
  const u = sessions.get((q.headers.authorization || '').replace('Bearer ', ''));
  if (!u) return s.status(401).json({ error: 'Please log in' });
  if (role && u.role !== role) return s.status(403).json({ error: 'Not allowed' });
  q.user = u; n();
};
const err = (s, c, m) => s.status(c).json({ error: m });

app.post('/api/register', (q, s) => {
  const { name, email, password, branch, cgpa } = q.body;
  if (!name || !email || !password) return err(s, 400, 'All fields are required');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return err(s, 400, 'Email already registered');
  const r = db.prepare('INSERT INTO users(name,email,password,role,branch,cgpa) VALUES(?,?,?,?,?,?)').run(name, email, hash(password), 'student', branch, +cgpa);
  s.json(session(db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid)));
});
app.post('/api/login', (q, s) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(q.body.email || '');
  if (!u || !verify(q.body.password || '', u.password)) return err(s, 401, 'Invalid email or password');
  s.json(session(u));
});

// ---------- JOBS ----------
app.get('/api/jobs', auth(), (q, s) => s.json(
  db.prepare('SELECT j.*, EXISTS(SELECT 1 FROM applications a WHERE a.job_id=j.id AND a.user_id=?) AS applied FROM jobs j ORDER BY j.id DESC')
    .all(q.user.id).map(j => ({ ...j, applied: !!j.applied }))));
app.post('/api/jobs', auth('admin'), (q, s) => {
  const b = q.body;
  db.prepare('INSERT INTO jobs(company,title,location,package,min_cgpa,deadline,description) VALUES(?,?,?,?,?,?,?)')
    .run(b.company, b.title, b.location, b.package, +b.min_cgpa, b.deadline, b.description);
  s.json({ ok: 1 });
});
app.delete('/api/jobs/:id', auth('admin'), (q, s) => {
  db.prepare('DELETE FROM applications WHERE job_id=?').run(q.params.id);
  db.prepare('DELETE FROM jobs WHERE id=?').run(q.params.id);
  s.json({ ok: 1 });
});

// ---------- APPLICATIONS ----------
app.post('/api/apply/:id', auth('student'), (q, s) => {
  const j = db.prepare('SELECT * FROM jobs WHERE id=?').get(q.params.id);
  if (!j) return err(s, 404, 'Job not found');
  if (q.user.cgpa < j.min_cgpa) return err(s, 400, 'Your CGPA is below the requirement');
  try { db.prepare('INSERT INTO applications(user_id,job_id) VALUES(?,?)').run(q.user.id, j.id); s.json({ ok: 1 }); }
  catch { err(s, 400, 'You already applied to this job'); }
});
app.get('/api/my-applications', auth('student'), (q, s) => s.json(
  db.prepare('SELECT a.*, j.company, j.title, j.package FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=? ORDER BY a.id DESC').all(q.user.id)));
app.get('/api/applications', auth('admin'), (q, s) => s.json(
  db.prepare('SELECT a.id, a.status, u.name, u.email, u.branch, u.cgpa, j.company, j.title FROM applications a JOIN users u ON u.id=a.user_id JOIN jobs j ON j.id=a.job_id ORDER BY a.id DESC').all()));
app.put('/api/applications/:id', auth('admin'), (q, s) => {
  db.prepare('UPDATE applications SET status=? WHERE id=?').run(q.body.status, q.params.id);
  s.json({ ok: 1 });
});
app.get('/api/stats', auth('admin'), (q, s) => s.json({
  students: db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,
  jobs: db.prepare('SELECT COUNT(*) c FROM jobs').get().c,
  applications: db.prepare('SELECT COUNT(*) c FROM applications').get().c,
  placed: db.prepare("SELECT COUNT(*) c FROM applications WHERE status='Selected'").get().c }));

app.listen(process.env.PORT || 3000, () => console.log('CampusHire running on port ' + (process.env.PORT || 3000)));

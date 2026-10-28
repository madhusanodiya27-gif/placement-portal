# CampusHire - College Placement Portal

**Stack:** HTML/CSS/JS single-page frontend, Node.js + Express backend (REST API), SQLite database.

## Run locally
    npm install
    npm start        # open http://localhost:3000

## Demo accounts
- Student: rahul@student.edu / student123
- Admin (TPO): admin@college.edu / admin123

## Features
- Student: register, login, browse and search jobs, apply (CGPA eligibility enforced), track status
- Admin: dashboard stats, post and delete jobs, review applicants, set status (Applied / Shortlisted / Selected / Rejected)
- Passwords hashed with scrypt, token-based sessions, role-based route protection

## Database (3 tables)
users(id, name, email, password, role, branch, cgpa) | jobs(id, company, title, location, package, min_cgpa, deadline, description) | applications(id, user_id, job_id, status, applied_at)

## Deploy free on Render
1. Push this folder to a GitHub repo.
2. render.com > New > Web Service > connect the repo.
3. Build command: `npm install`  Start command: `npm start`
4. Deploy and share the .onrender.com link. (Free tier resets the database on restart; seed data is recreated automatically.)

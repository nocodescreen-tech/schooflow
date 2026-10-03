from flask import Flask, render_template, request, redirect, url_for, flash, send_file, Response
import sqlite3
import os
import subprocess

app = Flask(__name__)
app.secret_key = 'supersecretkey'
UPLOAD_FOLDER = 'uploads'
DOWNLOAD_FOLDER = 'downloads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

def get_db():
    db = sqlite3.connect('schoolflow.db')
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with app.app_context():
        db = get_db()
        db.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'student'
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL
            )
        ''')
        # Insert sample data if empty
        cur = db.execute('SELECT COUNT(*) FROM users')
        if cur.fetchone()[0] == 0:
            db.executemany('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                           [('admin', 'admin123', 'teacher'),
                            ('student1', 'pass123', 'student'),
                            ('teacher1', 'teach123', 'teacher')])
        db.commit()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        # VULNERABLE: SQL injection via concatenation
        query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
        db = get_db()
        try:
            cur = db.execute(query)
            user = cur.fetchone()
            if user:
                flash('Login successful!', 'success')
                return redirect(url_for('dashboard'))
            else:
                flash('Invalid credentials', 'danger')
        except Exception as e:
            flash(f'Error: {e}', 'danger')
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/search', methods=['GET', 'POST'])
def search():
    results = []
    if request.method == 'POST':
        query = request.form.get('query', '')
        # VULNERABLE: Reflected XSS - query directly inserted into template without escaping
        # In template we will use |safe to demonstrate
        db = get_db()
        cur = db.execute("SELECT title, content FROM announcements WHERE title LIKE ? OR content LIKE ?",
                         ('%' + query + '%', '%' + query + '%'))
        results = cur.fetchall()
    return render_template('search.html', query=request.form.get('query', ''), results=results)

@app.route('/upload', methods=['GET', 'POST'])
def upload():
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file part', 'danger')
            return redirect(request.url)
        file = request.files['file']
        if file.filename == '':
            flash('No selected file', 'danger')
            return redirect(request.url)
        # VULNERABLE: No validation of file extension or content
        filename = file.filename
        file.save(os.path.join(UPLOAD_FOLDER, filename))
        flash(f'File {filename} uploaded successfully!', 'success')
        return redirect(url_for('upload'))
    return render_template('upload.html')

@app.route('/download/<filename>')
def download(filename):
    # VULNERABLE: Path traversal - no sanitization
    filepath = os.path.join(DOWNLOAD_FOLDER, filename)
    if not os.path.exists(filepath):
        # Try to catch traversal attempts for demo
        return 'File not found', 404
    return send_file(filepath, as_attachment=True)

@app.route('/ping', methods=['GET', 'POST'])
def ping():
    output = ''
    if request.method == 'POST':
        host = request.form.get('host', '127.0.0.1')
        # VULNERABLE: Command injection via subprocess with shell=True
        try:
            output = subprocess.check_output(f'ping -n 4 {host}', shell=True, stderr=subprocess.STDOUT, universal_newlines=True)
        except subprocess.CalledProcessError as e:
            output = e.output
    return render_template('ping.html', output=output)

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
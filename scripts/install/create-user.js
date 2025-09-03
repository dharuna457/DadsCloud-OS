/* Create or update a user with a bcrypt-hashed password in config/users.json
   Usage: npm run create-user -- <username> <password> [role]
*/
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const [,, username, password, role='admin'] = process.argv;
if (!username || !password) {
  console.error('Usage: npm run create-user -- <username> <password> [role]');
  process.exit(1);
}

const cfgDir = path.join(__dirname, '..', '..', 'config');
const cfgFile = path.join(cfgDir, 'users.json');
if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });

let users = [];
if (fs.existsSync(cfgFile)) {
  try { users = JSON.parse(fs.readFileSync(cfgFile, 'utf-8')); } catch {}
}
const hash = bcrypt.hashSync(password, 10);
const idx = users.findIndex(u => u.username === username);
if (idx >= 0) users[idx] = { username, passwordHash: hash, role };
else users.push({ username, passwordHash: hash, role });

fs.writeFileSync(cfgFile, JSON.stringify(users, null, 2));
console.log('✅ User saved to', cfgFile);

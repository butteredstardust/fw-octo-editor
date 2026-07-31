const { spawn } = require('child_process');

const SQLITE_SHELL = process.env.FW_SQLITE_BIN || 'C:\\tmp\\fw-tools\\sqlite3mc\\bin\\sqlite3mc_shell_x64.exe';

function sqliteStringLiteral(value, label = 'value') {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) {
    throw Object.assign(new Error(`${label} contains unsupported control characters`), { status: 400 });
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function sanitizeOutput(text, key) {
  if (!text || !key) return text || '';
  return text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '***REDACTED***');
}

async function runShell(dbPath, key, commands) {
  const keyLiteral = sqliteStringLiteral(key, 'Database key');
  return new Promise((resolve, reject) => {
    const child = spawn(SQLITE_SHELL, ['-batch', '-bail', dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Shell spawn error: ${err.message}`));
    });

    child.on('close', (code) => {
      const cleanStdout = sanitizeOutput(stdout, key);
      const cleanStderr = sanitizeOutput(stderr, key);
      if (code !== 0) {
        return reject(new Error(`Shell exited with code ${code}: ${cleanStderr || cleanStdout}`));
      }
      const lines = cleanStdout.split('\n').filter(l => l.trim() !== '' && l.trim() !== 'ok');
      resolve(lines);
    });

    const sql = `PRAGMA key = ${keyLiteral};\nPRAGMA cipher_compatibility = 3;\n.timeout 5000\n${commands.join(';\n')};\n.quit\n`;
    child.stdin.write(sql);
    child.stdin.end();
  });
}

async function runIntegrityCheck(dbPath, key) {
  try {
    const results = await runShell(dbPath, key, ['PRAGMA integrity_check']);
    const integrityResult = results.find(r => r.includes('integrity_check')) || results.join('\n') || 'ok';
    return {
      passed: integrityResult.toLowerCase().includes('ok'),
      raw: integrityResult
    };
  } catch (err) {
    return {
      passed: false,
      error: err.message
    };
  }
}

async function validateForeignKeys(dbPath, key) {
  try {
    const results = await runShell(dbPath, key, [
      'SELECT count(*) AS ForeignKeyErrors FROM pragma_foreign_key_check'
    ]);
    const count = results[0] ? parseInt(results[0].trim(), 10) : -1;
    return {
      passed: count === 0,
      errors: count,
      details: results
    };
  } catch (err) {
    return {
      passed: false,
      errors: -1,
      error: err.message
    };
  }
}

module.exports = { runShell, runIntegrityCheck, validateForeignKeys, sanitizeOutput, sqliteStringLiteral };

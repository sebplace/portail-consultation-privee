// Gate de validation (zéro dépendance) : vérifie la SYNTAXE de tous les modules,
// exécute les suites de tests, et effectue un contrôle de FORMAT léger (tabulations,
// espaces en fin de ligne, fin de fichier). Lancer : node check.mjs
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
let errors = 0, warnings = 0;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (['.js', '.mjs'].includes(extname(name))) acc.push(p);
  }
  return acc;
}

const files = walk(root);
console.log(`== Syntaxe (node --check) : ${files.length} fichier(s) ==`);
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { errors++; console.log(`  KO  ${relative(root, f)}\n${e.stderr ? e.stderr.toString() : e.message}`); }
}
if (!errors) console.log('  ok  tous les modules compilent');

console.log('\n== Format (contrôle léger) ==');
for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  const rel = relative(root, f);
  if (txt.includes('\t')) { warnings++; console.log(`  !!  ${rel} : contient des tabulations`); }
  if (/[ \t]+\n/.test(txt)) { warnings++; console.log(`  !!  ${rel} : espaces en fin de ligne`); }
  if (txt.length && !txt.endsWith('\n')) { warnings++; console.log(`  !!  ${rel} : pas de nouvelle ligne finale`); }
}
if (!warnings) console.log('  ok  format conforme (pas de tabulation, pas d\'espace traînant, fin de ligne finale)');

console.log('\n== Tests ==');
const suites = ['tests/rules.test.mjs', 'tests/store.test.mjs', 'tests/e2e.test.mjs'];
for (const s of suites) {
  try { execFileSync(process.execPath, [join(root, s)], { stdio: 'pipe' }); console.log(`  ok  ${s}`); }
  catch (e) { errors++; console.log(`  KO  ${s}\n${e.stdout ? e.stdout.toString() : ''}${e.stderr ? e.stderr.toString() : e.message}`); }
}

console.log(`\nRésultat : ${errors} erreur(s), ${warnings} avertissement(s).`);
process.exit(errors ? 1 : 0);

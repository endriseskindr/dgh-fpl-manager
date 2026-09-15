const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
const errors = [];
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const pkg = JSON.parse(read('package.json'));
if (!fs.existsSync(path.join(root,'app.config.ts'))) errors.push('Missing app.config.ts');
if (!fs.existsSync(path.join(root,'eas.json'))) errors.push('Missing eas.json');
const app = read('app.config.ts');
if (!app.includes('com.app.dghfpldominator')) errors.push('Android package identifier missing');
// Cross-check package.json/app.config.ts/versionCode consistency instead of a
// hardcoded release number - a hardcoded check here (previously "2.5.0")
// silently goes stale on every version bump and was already failing against
// this project's own 3.1.0 release before this pass touched anything.
const appVersionMatch = app.match(/version:\s*"([\d.]+)"/);
const versionCodeMatch = app.match(/versionCode:\s*(\d+)/);
if (!appVersionMatch) errors.push('Could not find Expo version: in app.config.ts');
else if (appVersionMatch[1] !== pkg.version) errors.push(`app.config.ts version "${appVersionMatch[1]}" does not match package.json version "${pkg.version}"`);
if (!versionCodeMatch) errors.push('Could not find Android versionCode: in app.config.ts');
else if (Number(versionCodeMatch[1]) < 310) errors.push(`Android versionCode ${versionCodeMatch[1]} did not increase from the 3.1.0 release (310)`);
const eas = JSON.parse(read('eas.json'));
if (eas.build?.['release-apk']?.android?.buildType !== 'apk') errors.push('release-apk profile must produce APK');
if (!fs.existsSync(path.join(root,'lib/analytics/comprehensiveTable.ts'))) errors.push('Missing comprehensive table engine');
if (!fs.existsSync(path.join(root,'lib/analytics/whatIf.ts'))) errors.push('Missing What-If engine');
if (!fs.existsSync(path.join(root,'lib/seasonStore.ts'))) errors.push('Missing season store');
if (!fs.existsSync(path.join(root,'lib/weeklyAwardsService.ts'))) errors.push('Missing weekly awards service');
if (!fs.existsSync(path.join(root,'lib/spyService.ts'))) errors.push('Missing DGH Spy service');
if (!fs.existsSync(path.join(root,'lib/analytics/priceIntel.ts'))) errors.push('Missing price intel module');
if (!fs.existsSync(path.join(root,'lib/analytics/newsIntel.ts'))) errors.push('Missing news intel module');
if (!fs.existsSync(path.join(root,'lib/analytics/rivalIntel.ts'))) errors.push('Missing rival intel module');
if (!fs.existsSync(path.join(root,'app/(tabs)/spy.tsx'))) errors.push('Missing DGH Spy screen');
const ct = read('lib/analytics/comprehensiveTable.ts');
if (!ct.includes('rawPoints - row.transferHits - row.bbBenchPoints - row.tcExtraPoints')) errors.push('DGH adjusted-score formula regression');
if (ct.includes('BONUS POUNDS') || ct.includes('bonusPounds')) errors.push('Forbidden Bonus Pounds scoring found');
try { cp.execFileSync('node',['scripts/engine-invariants.js'],{cwd:root,stdio:'inherit'}); } catch { errors.push('engine invariants failed'); }
if (errors.length) { console.error('\nRELEASE PREFLIGHT FAILED'); errors.forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log('\nDGH RELEASE PREFLIGHT PASSED');
console.log(`Version: ${pkg.version} / Android versionCode: ${versionCodeMatch[1]}`);
console.log('DGH scoring: Raw - Hits - BB Bench - TC 3rd; Bonus Pounds disabled.');
console.log('APK profile: release-apk');
console.log('Native EAS build still requires a working Android/EAS environment and credentials.');

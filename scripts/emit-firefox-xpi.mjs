import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), '.output');
const firefoxZip = readdirSync(outputDir)
  .filter((file) => file.endsWith('-firefox.zip'))
  .sort()
  .at(-1);

if (!firefoxZip) {
  console.error('No Firefox zip package was found in .output.');
  process.exit(1);
}

const zipPath = join(outputDir, firefoxZip);
const xpiPath = join(outputDir, firefoxZip.replace(/-firefox\.zip$/, '-firefox.xpi'));

if (!existsSync(zipPath)) {
  console.error(`Firefox zip package does not exist: ${zipPath}`);
  process.exit(1);
}

copyFileSync(zipPath, xpiPath);
console.log(`Created ${xpiPath}`);

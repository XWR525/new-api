import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')
const locales = ['en', 'zh', 'fr', 'ja', 'ru', 'vi']

const keys = [
  'Are you sure you want to delete group "{{name}}"?',
  'Group name is required',
  'Group name must be 32 characters or fewer',
  'Group name can only contain letters, numbers, underscores and hyphens',
  'Display name must be 50 characters or fewer',
  'Remove {{name}} from this group',
  'Previous',
  'Next',
  'Page {{page}} of {{total}}',
  'Failed to load',
]

for (const locale of locales) {
  const json = JSON.parse(
    await fs.readFile(path.join(LOCALES_DIR, `${locale}.json`), 'utf8')
  )
  const t = json.translation
  const missing = keys.filter((k) => !Object.prototype.hasOwnProperty.call(t, k))
  const present = keys.filter((k) => Object.prototype.hasOwnProperty.call(t, k))
  console.log(`\n=== ${locale} ===`)
  console.log('MISSING:', missing.length ? JSON.stringify(missing, null, 1) : 'none')
  console.log('PRESENT:', present.length ? JSON.stringify(present) : 'none')
}

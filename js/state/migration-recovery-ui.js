// @ts-check
// Blocking startup recovery for a state schema that could not be upgraded.
// The persisted blob is deliberately left untouched so retrying after an app
// update always starts from the same recoverable bytes.
import { openManagedModal } from '../ui/modal-stack.js';

/** @param {unknown} error */
export function migrationRecoveryCopy(error) {
  const futureSchema = !!(error && typeof error === 'object' &&
    'fromVersion' in error && 'toVersion' in error &&
    error.fromVersion === error.toVersion);
  return {
    title: 'Your data is safe',
    message: futureSchema
      ? 'This data was saved by a newer version of Helyx. Update the app, then retry.'
      : 'Helyx could not finish a data upgrade, so it stopped before saving any changes. Update the app or retry when you are ready.',
    action: 'Retry',
  };
}

/**
 * @param {unknown} error
 * @param {Document} [doc]
 * @param {() => void} [reload]
 */
export function showMigrationRecovery(error, doc = document, reload = () => location.reload()) {
  const existing = doc.getElementById('migrationRecovery');
  if (existing) return existing;
  const copy = migrationRecoveryCopy(error);

  const backdrop = doc.createElement('div');
  backdrop.id = 'migrationRecovery';
  backdrop.className = 'migration-recovery';
  backdrop.setAttribute('role', 'alertdialog');
  backdrop.setAttribute('aria-labelledby', 'migrationRecoveryTitle');
  backdrop.setAttribute('aria-describedby', 'migrationRecoveryMessage');

  const panel = doc.createElement('div');
  panel.className = 'migration-recovery__panel';
  const eyebrow = doc.createElement('div');
  eyebrow.className = 'migration-recovery__eyebrow';
  eyebrow.textContent = 'Protected recovery';
  const title = doc.createElement('h1');
  title.id = 'migrationRecoveryTitle';
  title.textContent = copy.title;
  const message = doc.createElement('p');
  message.id = 'migrationRecoveryMessage';
  message.textContent = copy.message;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'btn-primary migration-recovery__action';
  button.textContent = copy.action;
  button.addEventListener('click', reload);

  panel.append(eyebrow, title, message, button);
  backdrop.append(panel);
  doc.body.append(backdrop);
  openManagedModal(backdrop, { initialFocus: button, dismissible: false, history: false });
  return backdrop;
}

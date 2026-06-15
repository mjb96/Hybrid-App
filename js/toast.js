// ==========================================
// TOAST NOTIFICATIONS (toast.js)
// ==========================================
export function showToast(msg, isError = false) {
  const toast = document.getElementById('sysToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = isError ? 'var(--accent-red)' : 'var(--accent-green)';
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 2500);
}

'use strict';
window.PTSHome = window.PTSHome || {};

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 1400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  showToast('已复制链接');
}

function openModal(modal) {
  closeAllModals();
  modal.classList.add('open');
}

function openStackModal(modal) {
  if (modal) modal.classList.add('open');
}

function closeStackModal(modal) {
  if (modal) modal.classList.remove('open');
}

function closeAllModals() {
  document.querySelectorAll('.modal.open').forEach(modal => modal.classList.remove('open'));
}

function renderQr(text) {
  els.qrImage.innerHTML = '';
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  els.qrImage.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
}

function openQrModal(url, tournamentName) {
  currentQrUrl = location.origin + url;
  els.qrTournamentName.innerHTML = `<strong>${escHtml(tournamentName || '未命名比赛')}</strong>`;
  els.qrUrl.textContent = currentQrUrl;
  renderQr(currentQrUrl);
  openModal(els.qrModal);
}

function detailRows(rows) {
  return `<div class="detail-block">${rows.map(([key, value]) => `
    <div class="detail-row">
      <div class="detail-key">${escHtml(key)}</div>
      <div class="detail-value">${value}</div>
    </div>
  `).join('')}</div>`;
}

Object.assign(window.PTSHome, { showToast, copyText, openModal, openStackModal, closeStackModal, closeAllModals, renderQr, openQrModal, detailRows });

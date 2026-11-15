const msg = document.getElementById('msg');

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById('open').addEventListener('click', async () => {
  msg.textContent = '';
  const tab = await activeTab();
  if (!tab) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'trr:open' });
    if (res && res.ok) window.close();
  } catch (e) {
    msg.textContent = 'Essa aba não é do TikTok (ou abriu antes de instalar a extensão). Abra o tiktok.com ou recarregue a aba com F5.';
  }
});

document.getElementById('go').addEventListener('click', async () => {
  const tab = await activeTab();
  if (tab) chrome.tabs.update(tab.id, { url: 'https://www.tiktok.com/' });
  window.close();
});

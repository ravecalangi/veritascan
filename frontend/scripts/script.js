/* ============================================================
   THEME
   ============================================================ */
const html = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle');

const savedTheme = localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);

themeToggleBtn.addEventListener('click', () => {
  const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  localStorage.setItem('theme', newTheme);
});

function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
}


/* ============================================================
   NAV LOGO
   ============================================================ */
const webName = document.getElementById('web-name');
webName.addEventListener('click', () => {
  window.location.href = '../html/index.html';
});


/* ============================================================
   NAVBAR SCROLL
   ============================================================ */
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20);
});


/* ============================================================
   MOBILE NAV
   ============================================================ */
const burgerBtn   = document.querySelector('.md-hidden');
const mobileNav   = document.getElementById('mobileNav');
const mobileClose = document.getElementById('mobileNavClose');

function openMobileNav() {
  mobileNav.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileNav() {
  mobileNav.classList.remove('open');
  document.body.style.overflow = '';
}

burgerBtn.addEventListener('click', openMobileNav);
mobileClose.addEventListener('click', closeMobileNav);

// close when any link inside is clicked
mobileNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', closeMobileNav);
});

// close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMobileNav();
    closeGsModal();
  }
});


/* ============================================================
   GET STARTED MODAL
   ============================================================ */
const gsOverlay     = document.getElementById('gsOverlay');
const getStartedBtn = document.getElementById('getStartedBtn');
const gsClose       = document.getElementById('gsClose');

function openGsModal() {
  gsOverlay.classList.remove('closing');
  gsOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeGsModal() {
  gsOverlay.classList.add('closing');
  setTimeout(() => {
    gsOverlay.classList.remove('active', 'closing');
    document.body.style.overflow = '';
  }, 550);
}

getStartedBtn.addEventListener('click', openGsModal);
gsClose.addEventListener('click', closeGsModal);

gsOverlay.addEventListener('click', (e) => {
  if (e.target === gsOverlay) closeGsModal();
});

document.querySelector('.gs-option[href="chatbot.html"]')
  ?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('veritascan_user_name');
    localStorage.removeItem('veritascan_chat_history');
    window.location.href = 'chatbot.html';
  });


/* ============================================================
   SCROLL HINT
   ============================================================ */
(function () {
  const hint = document.getElementById('scrollHint');
  if (!hint) return;
  function onScroll() {
    if (window.scrollY > 60) {
      hint.classList.add('hidden');
      window.removeEventListener('scroll', onScroll);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();


/* ============================================================
   SAMPLE TABS
   ============================================================ */
document.querySelectorAll('.sample-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sample-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sample-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

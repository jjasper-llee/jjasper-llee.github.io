const instruments = [
  {
    id: 'lumicello',
    name: 'LumiCello 1724',
    type: 'Cello',
    sharePrice: 125,
    available: 1200,
    filled: 78,
    apr: '8.2%',
    location: 'Boston Symphony',
    tags: ['Classical', 'Residency', 'Boston'],
  },
  {
    id: 'strad',
    name: 'Stradivari "Phoenix"',
    type: 'Violin',
    sharePrice: 210,
    available: 600,
    filled: 64,
    apr: '10.4%',
    location: 'LA Phil',
    tags: ['Touring', 'Film Score'],
  },
  {
    id: 'carbonharp',
    name: 'CarbonWave Harp',
    type: 'Harp',
    sharePrice: 65,
    available: 2500,
    filled: 52,
    apr: '6.1%',
    location: 'National Opera',
    tags: ['Experimental', 'Residency'],
  },
  {
    id: 'electric-bass',
    name: 'Modular Electric Bass',
    type: 'Bass',
    sharePrice: 48,
    available: 5000,
    filled: 33,
    apr: '5.4%',
    location: 'Brooklyn Sessions',
    tags: ['Studio', 'Streaming'],
  },
];

const voteSessions = [
  {
    id: 'session-a',
    instrument: 'LumiCello 1724',
    date: 'Jul 12 · Carnegie Hall',
    options: [
      { name: 'Isabelle Tan', votes: 2124 },
      { name: 'Mateo Rios', votes: 1860 },
    ],
  },
  {
    id: 'session-b',
    instrument: 'Stradivari "Phoenix"',
    date: 'Aug 03 · Walt Disney Concert Hall',
    options: [
      { name: 'Evergreen Quartet', votes: 1304 },
      { name: 'LA Young Artists', votes: 980 },
    ],
  },
  {
    id: 'session-c',
    instrument: 'CarbonWave Harp',
    date: 'Aug 18 · Virtual Residency',
    options: [
      { name: 'Nova Sound Bath', votes: 654 },
      { name: 'Anam Cara Collective', votes: 742 },
    ],
  },
];

const state = {
  balance: 0,
  holdings: {},
  connectedBank: false,
  accountCreated: false,
};

const repoApiUrl = 'https://api.github.com/repos/jjasper-llee/instrument-nft';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

function renderInstruments() {
  const grid = document.getElementById('instrument-grid');
  const select = document.getElementById('instrumentSelect');
  if (!grid || !select) return;

  grid.innerHTML = '';
  select.innerHTML = '<option value="">Choose instrument</option>';

  instruments.forEach((instrument) => {
    const card = document.createElement('article');
    card.className = 'instrument-card';
    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">${instrument.type}</p>
          <h4>${instrument.name}</h4>
        </div>
        <button class="ghost" data-buy="${instrument.id}">Buy</button>
      </header>
      <p class="micro">${instrument.location}</p>
      <div class="metric-grid">
        <div><span class="micro">Share price</span><br>${formatCurrency(instrument.sharePrice)}</div>
        <div><span class="micro">Target APR</span><br>${instrument.apr}</div>
        <div><span class="micro">Shares open</span><br>${instrument.available}</div>
        <div><span class="micro">Filled</span><br>${instrument.filled}%</div>
      </div>
      <div class="progress"><span style="width:${instrument.filled}%"></span></div>
      <div class="tag-row">
        ${instrument.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
      </div>
    `;
    grid.appendChild(card);

    const option = document.createElement('option');
    option.value = instrument.id;
    option.textContent = `${instrument.name} (${instrument.type})`;
    select.appendChild(option);
  });

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-buy]');
    if (!button) return;
    const id = button.dataset.buy;
    select.value = id;
    document.getElementById('buyForm')?.scrollIntoView({ behavior: 'smooth' });
  });
}

function renderHeroMetrics() {
  const container = document.getElementById('heroMetrics');
  if (!container) return;

  const metrics = [
    { label: 'Holdings', value: Object.keys(state.holdings).length },
    {
      label: 'Est. Yield',
      value:
        state.balance > 0
          ? `${(5 + Math.random() * 4).toFixed(1)}%`
          : '—',
    },
    { label: 'Voting power', value: `${Object.values(state.holdings).reduce((a, b) => a + b, 0)} votes` },
  ];

  container.innerHTML = metrics
    .map(
      (metric) => `
        <div class="metric">
          <span>${metric.label}</span>
          <strong>${metric.value}</strong>
        </div>
      `
    )
    .join('');
}

function updateBalances() {
  const balanceDisplay = document.getElementById('balanceDisplay');
  const buyingPower = document.getElementById('buyingPower');
  if (balanceDisplay) balanceDisplay.textContent = formatCurrency(state.balance);
  if (buyingPower) buyingPower.textContent = formatCurrency(state.balance);
  renderHeroMetrics();
}

function handleScrollButtons() {
  document.querySelectorAll('[data-scroll]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.scroll);
      target?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function handleSignup() {
  const form = document.getElementById('signupForm');
  const status = document.getElementById('signupStatus');
  if (!form || !status) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.accountCreated = true;
    status.textContent = 'Account created. Check email to verify identity.';
    status.style.color = '#6df9c6';
    form.reset();
  });
}

function handleBankLink() {
  const form = document.getElementById('bankForm');
  const status = document.getElementById('bankStatus');
  if (!form || !status) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.accountCreated) {
      status.textContent = 'Create an account before linking a bank.';
      status.style.color = '#ff8b6b';
      return;
    }

    state.connectedBank = true;
    status.textContent = 'Bank connected. Ready to fund instantly.';
    status.style.color = '#6df9c6';
    form.reset();
  });
}

function handleAddMoney() {
  const form = document.getElementById('addMoneyForm');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const amount = Number(formData.get('amount')) || 0;

    if (!state.connectedBank) {
      alert('Connect a bank first.');
      return;
    }

    state.balance += amount;
    updateBalances();
    form.reset();
  });
}

function handleBuyShares() {
  const form = document.getElementById('buyForm');
  const status = document.getElementById('buyStatus');
  if (!form || !status) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const instrumentId = formData.get('instrument');
    const shares = Number(formData.get('shares'));
    const instrument = instruments.find((item) => item.id === instrumentId);

    if (!instrument) {
      status.textContent = 'Choose an instrument to continue.';
      status.style.color = '#ff8b6b';
      return;
    }

    const cost = shares * instrument.sharePrice;

    if (cost > state.balance) {
      status.textContent = 'Not enough buying power. Fund your account first.';
      status.style.color = '#ff8b6b';
      return;
    }

    state.balance -= cost;
    state.holdings[instrumentId] = (state.holdings[instrumentId] || 0) + shares;
    status.textContent = `Purchased ${shares} shares of ${instrument.name}.`;
    status.style.color = '#6df9c6';
    updateBalances();
    form.reset();
  });
}

function handleVoteCards() {
  const grid = document.getElementById('voteGrid');
  if (!grid) return;

  grid.innerHTML = '';

  voteSessions.forEach((session) => {
    const card = document.createElement('article');
    card.className = 'vote-card';

    card.innerHTML = `
      <header>
        <div>
          <p class="eyebrow">${session.instrument}</p>
          <h4>${session.date}</h4>
        </div>
        <span class="micro">1 share = 1 vote</span>
      </header>
      <div class="vote-options">
        ${session.options
          .map(
            (option, index) => `
              <button data-session="${session.id}" data-option="${index}">
                <span>${option.name}</span>
                <strong>${option.votes.toLocaleString()}</strong>
              </button>
            `
          )
          .join('')}
      </div>
    `;

    grid.appendChild(card);
  });

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-session]');
    if (!button) return;
    const sessionId = button.dataset.session;
    const optionIndex = Number(button.dataset.option);

    const session = voteSessions.find((item) => item.id === sessionId);
    if (!session) return;

    const votingPower = Object.values(state.holdings).reduce((a, b) => a + b, 0);
    const increment = Math.max(1, votingPower || 10);
    session.options[optionIndex].votes += increment;
    button.querySelector('strong').textContent = session.options[optionIndex].votes.toLocaleString();
    button.classList.add('solid');
  });
}

function initFooterYear() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
}

async function hydrateRepoMeta() {
  const stars = document.getElementById('repoStars');
  const forks = document.getElementById('repoForks');
  const issues = document.getElementById('repoIssues');
  if (!stars || !forks || !issues) return;

  try {
    const response = await fetch(repoApiUrl);
    if (!response.ok) throw new Error('Request failed');
    const data = await response.json();

    stars.textContent = (data.stargazers_count ?? 0).toLocaleString();
    forks.textContent = (data.forks_count ?? 0).toLocaleString();
    issues.textContent = (data.open_issues_count ?? 0).toLocaleString();
  } catch (error) {
    [stars, forks, issues].forEach((node) => {
      node.textContent = '—';
    });
  }
}

function handleRepoCopy() {
  const button = document.getElementById('copyRepo');
  if (!button) return;
  const cloneUrl = button.dataset.repoUrl;

  button.addEventListener('click', async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cloneUrl);
      } else {
        const input = document.createElement('input');
        input.value = cloneUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      button.textContent = 'Copied!';
      button.classList.add('solid');
    } catch (error) {
      button.textContent = 'Copy manually';
    }

    setTimeout(() => {
      button.textContent = 'Copy clone URL';
      button.classList.remove('solid');
    }, 1800);
  });
}

function init() {
  renderInstruments();
  renderHeroMetrics();
  handleScrollButtons();
  handleSignup();
  handleBankLink();
  handleAddMoney();
  handleBuyShares();
  handleVoteCards();
  updateBalances();
  initFooterYear();
  hydrateRepoMeta();
  handleRepoCopy();
}

document.addEventListener('DOMContentLoaded', init);

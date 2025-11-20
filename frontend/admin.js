document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('token-input');
  const loadBtn = document.getElementById('load-btn');
  const tableBody = document.querySelector('#dossier-table tbody');
  const detailArea = document.getElementById('detail-area');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const pageInfo = document.getElementById('page-info');
  const backendInput = document.getElementById('backend-url');
  let token = localStorage.getItem('adminToken') || '';
  let backendUrl = localStorage.getItem('backendUrl') || '';
  if (token) tokenInput.value = token;
  if (backendUrl && backendInput) backendInput.value = backendUrl;
  let offset = 0;
  const limit = 20;

  async function loadList() {
    tableBody.innerHTML = '';
    pageInfo.textContent = '';
    try {
      const base =
        (backendInput && backendInput.value && backendInput.value.trim()) ||
        backendUrl ||
        'http://localhost:3000';
      const url =
        base.replace(/\/$/, '') +
        `/api/dossiers?limit=${limit}&offset=${offset}`;
      const res = await fetch(url, { headers: { 'x-admin-token': token } });
      if (res.status === 401) return alert('Unauthorized - ongeldig token');
      const data = await res.json();
      // apply client-side sorting before rendering
      const items = Array.isArray(data.items) ? data.items.slice() : [];
      const sortEl = document.getElementById('sort-select');
      const sortBy = sortEl ? sortEl.value : 'id';
      items.sort((a, b) => {
        if (sortBy === 'prioriteit') {
          const order = { HOOG: 3, MIDDEN: 2, LAAG: 1 };
          return (
            (order[b.prioriteit] || 0) - (order[a.prioriteit] || 0) ||
            b.id - a.id
          );
        }
        if (sortBy === 'datum') {
          const da = Date.parse(a.datum) || 0;
          const db = Date.parse(b.datum) || 0;
          return db - da || b.id - a.id;
        }
        return b.id - a.id;
      });

      pageInfo.textContent = `offset ${data.offset} limit ${data.limit}`;
      for (const row of items) {
        const tr = document.createElement('tr');
        const priorityClass = (row.prioriteit || '').toLowerCase();
        const badge = `<span class="badge ${priorityClass}">${
          row.prioriteit || ''
        }</span>`;
        tr.innerHTML = `
          <td>${row.id}</td>
          <td>${row.datum}</td>
          <td>${badge}</td>
          <td>${row.status}</td>
          <td>${(row.samenvatting || row.beschrijving || '').slice(0, 80)}</td>
          <td><button class="btn small" data-id="${row.id}">Open</button></td>
        `;
        tableBody.appendChild(tr);
      }
    } catch (e) {
      console.error(e);
      alert('Fout bij laden lijst');
    }
  }

  async function loadDetail(id) {
    detailArea.innerHTML = 'Laden...';
    try {
      const base =
        (backendInput && backendInput.value && backendInput.value.trim()) ||
        backendUrl ||
        'http://localhost:3000';
      const url = base.replace(/\/$/, '') + `/api/dossiers/${id}`;
      const res = await fetch(url, { headers: { 'x-admin-token': token } });
      if (res.status === 401) return alert('Unauthorized - ongeldig token');
      const d = await res.json();
      renderDetail(d);
    } catch (e) {
      console.error(e);
      detailArea.innerHTML = 'Fout bij laden dossier';
    }
  }

  function renderDetail(d) {
    detailArea.innerHTML = `
      <div>
        <div><strong>ID:</strong> ${d.id}</div>
        <div><strong>Datum:</strong> <input id="fld-datum" value="${escapeHtml(
          d.datum || ''
        )}"></div>
        <div><strong>Prioriteit:</strong> <input id="fld-prioriteit" value="${escapeHtml(
          d.prioriteit || ''
        )}"></div>
        <div><strong>Status:</strong> <input id="fld-status" value="${escapeHtml(
          d.status || ''
        )}"></div>
        <div><strong>Beschrijving:</strong><textarea id="fld-beschrijving">${escapeHtml(
          d.beschrijving || ''
        )}</textarea></div>
        <div><strong>Samenvatting:</strong><textarea id="fld-samenvatting">${escapeHtml(
          d.samenvatting || ''
        )}</textarea></div>
        <div style="margin-top:10px">
          <button id="save-btn" class="btn">Opslaan</button>
          <button id="delete-btn" class="btn" style="background:#c0392b">Verwijder</button>
        </div>
      </div>
    `;

    document.getElementById('save-btn').addEventListener('click', async () => {
      const payload = {
        datum: document.getElementById('fld-datum').value,
        prioriteit: document.getElementById('fld-prioriteit').value,
        status: document.getElementById('fld-status').value,
        beschrijving: document.getElementById('fld-beschrijving').value,
        samenvatting: document.getElementById('fld-samenvatting').value,
      };
      try {
        const base =
          (backendInput && backendInput.value && backendInput.value.trim()) ||
          backendUrl ||
          'http://localhost:3000';
        const url = base.replace(/\/$/, '') + `/api/dossiers/${d.id}`;
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': token,
          },
          body: JSON.stringify(payload),
        });
        const j = await res.json();
        if (res.status === 401) return alert('Unauthorized - ongeldig token');
        if (res.ok) {
          alert('Opgeslagen');
          loadList();
        } else {
          alert('Fout bij opslaan: ' + JSON.stringify(j));
        }
      } catch (e) {
        console.error(e);
        alert('Fout bij opslaan');
      }
    });

    document
      .getElementById('delete-btn')
      .addEventListener('click', async () => {
        if (!confirm('Weet je zeker dat je dit dossier wilt verwijderen?'))
          return;
        try {
          const base =
            (backendInput && backendInput.value && backendInput.value.trim()) ||
            backendUrl ||
            'http://localhost:3000';
          const url = base.replace(/\/$/, '') + `/api/dossiers/${d.id}`;
          const res = await fetch(url, {
            method: 'DELETE',
            headers: { 'x-admin-token': token },
          });
          const j = await res.json();
          if (res.status === 401) return alert('Unauthorized - ongeldig token');
          if (res.ok) {
            alert('Verwijderd');
            detailArea.innerHTML = 'Selecteer een dossier';
            loadList();
          } else {
            alert('Fout bij verwijderen: ' + JSON.stringify(j));
          }
        } catch (e) {
          console.error(e);
          alert('Fout bij verwijderen');
        }
      });
  }

  function escapeHtml(s) {
    return (s || '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[c])
    );
  }

  tableBody.addEventListener('click', (e) => {
    if (e.target.matches('button[data-id]')) {
      const id = e.target.getAttribute('data-id');
      // open modal view for quick actions
      loadCaseModal(id);
    }
  });

  prevBtn.addEventListener('click', () => {
    offset = Math.max(0, offset - limit);
    loadList();
  });
  nextBtn.addEventListener('click', () => {
    offset += limit;
    loadList();
  });

  loadBtn.addEventListener('click', () => {
    token = tokenInput.value || '';
    const inputUrl =
      (backendInput && backendInput.value && backendInput.value.trim()) || '';
    if (inputUrl) backendUrl = inputUrl;
    localStorage.setItem('adminToken', token);
    if (backendUrl) localStorage.setItem('backendUrl', backendUrl);
    loadList();
  });

  // reload when sort selection changes
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.addEventListener('change', () => loadList());

  // initial load if token present
  if (token) loadList();

  // --- Modal handling & quick actions ---
  const modal = document.getElementById('case-modal');
  const modalBody = document.getElementById('modal-body');
  const modalIdSpan = document.getElementById('modal-id');
  const modalClose = document.getElementById('modal-close');
  const modalBezig = document.getElementById('modal-bezig');
  const modalKlaar = document.getElementById('modal-klaar');
  const modalDelete = document.getElementById('modal-delete');

  function showModal() {
    modal.setAttribute('aria-hidden', 'false');
  }
  function hideModal() {
    modal.setAttribute('aria-hidden', 'true');
    modalBody.innerHTML = '';
  }

  modalClose.addEventListener('click', hideModal);

  async function loadCaseModal(id) {
    modalBody.innerHTML = 'Laden...';
    try {
      const base =
        (backendInput && backendInput.value && backendInput.value.trim()) ||
        backendUrl ||
        'http://localhost:3000';
      const url = base.replace(/\/$/, '') + `/api/dossiers/${id}`;
      const res = await fetch(url, { headers: { 'x-admin-token': token } });
      if (res.status === 401) {
        alert('Unauthorized - ongeldig token');
        return;
      }
      const d = await res.json();
      modalIdSpan.textContent = d.id;
      renderModal(d);
      showModal();
    } catch (e) {
      console.error(e);
      modalBody.innerHTML = 'Fout bij laden dossier';
    }
  }

  function renderModal(d) {
    modalBody.innerHTML = `
      <div>
        <div><strong>Datum:</strong> ${escapeHtml(d.datum || '')}</div>
        <div><strong>Prioriteit:</strong> ${escapeHtml(
          d.prioriteit || ''
        )}</div>
        <div><strong>Status:</strong> ${escapeHtml(d.status || '')}</div>
        <div style="margin-top:8px"><strong>Beschrijving:</strong><pre style="white-space:pre-wrap">${escapeHtml(
          d.beschrijving || ''
        )}</pre></div>
        <div style="margin-top:8px"><strong>Samenvatting:</strong><pre style="white-space:pre-wrap">${escapeHtml(
          d.samenvatting || ''
        )}</pre></div>
      </div>
    `;

    // attach actions
    modalBezig.onclick = async () => {
      await updateStatus(d.id, 'bezig');
      hideModal();
    };
    modalKlaar.onclick = async () => {
      await updateStatus(d.id, 'klaar');
      hideModal();
    };
    modalDelete.onclick = async () => {
      if (!confirm('Weet je zeker dat je dit dossier wilt verwijderen?'))
        return;
      await deleteCase(d.id);
      hideModal();
    };
  }

  async function updateStatus(id, status) {
    try {
      const base =
        (backendInput && backendInput.value && backendInput.value.trim()) ||
        backendUrl ||
        'http://localhost:3000';
      const url = base.replace(/\/$/, '') + `/api/dossiers/${id}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        alert('Unauthorized');
        return;
      }
      if (!res.ok) {
        const j = await res.json();
        alert('Fout: ' + JSON.stringify(j));
        return;
      }
      alert('Status bijgewerkt');
      loadList();
    } catch (e) {
      console.error(e);
      alert('Fout bij updaten status');
    }
  }

  async function deleteCase(id) {
    try {
      const base =
        (backendInput && backendInput.value && backendInput.value.trim()) ||
        backendUrl ||
        'http://localhost:3000';
      const url = base.replace(/\/$/, '') + `/api/dossiers/${id}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'x-admin-token': token },
      });
      if (res.status === 401) {
        alert('Unauthorized');
        return;
      }
      if (!res.ok) {
        const j = await res.json();
        alert('Fout: ' + JSON.stringify(j));
        return;
      }
      alert('Verwijderd');
      loadList();
    } catch (e) {
      console.error(e);
      alert('Fout bij verwijderen');
    }
  }
});

(function(){
  const DATA_URL = 'data.json';
  const form = document.getElementById('orderForm');
  const nameInput = document.getElementById('name');
  const optionInput = document.getElementById('optionInput');
  const quantityInput = document.getElementById('quantity');
  const optionsList = document.getElementById('optionsList');
  const unitsList = document.getElementById('unitsList');
  const unitInput = document.getElementById('unitInput');
  const message = document.getElementById('message');
  let optionsMap = {}; // name -> unit
  let unitsArr = [];
  const optionSuggestions = document.getElementById('optionSuggestions');

  function loadOptions(){
    fetch(DATA_URL).then(r=>r.json()).then(list=>{
      optionsList.innerHTML = '';
      optionsMap = {};
      list.forEach(item=>{
        const name = item.name || item;
        const unit = item.unit || '';
        optionsMap[name] = unit;
        const el = document.createElement('option');
        el.value = name;
        optionsList.appendChild(el);
      });
      // construir lista de unidades única
      const set = new Set(Object.values(optionsMap).filter(Boolean));
      unitsArr = Array.from(set);
      if(unitsList){ unitsList.innerHTML = ''; unitsArr.forEach(u=>{ const o=document.createElement('option'); o.value = u; unitsList.appendChild(o); }); }
    }).catch(()=>{
      // fallback simple options
      const fallback = [{name:'Opción A',unit:'unidad'},{name:'Opción B',unit:'unidad'}];
      optionsList.innerHTML = '';
      optionsMap = {};
      fallback.forEach(item=>{ optionsMap[item.name]=item.unit; const el=document.createElement('option'); el.value=item.name; optionsList.appendChild(el); });
      unitsArr = Array.from(new Set(Object.values(optionsMap).filter(Boolean)));
      if(unitsList){ unitsList.innerHTML = ''; unitsArr.forEach(u=>{ const o=document.createElement('option'); o.value = u; unitsList.appendChild(o); }); }
    });
  }

  function getSubmissions(){
    try{ return JSON.parse(localStorage.getItem('submissions')||'[]'); }catch(e){return []}
  }
  function saveSubmissions(arr){ localStorage.setItem('submissions', JSON.stringify(arr)); }

  function showMsg(txt,ok=true){ message.textContent = txt; message.style.color = ok? '#0d9488':'#b91c1c'; setTimeout(()=>message.textContent='','3500'); }

  if(form){
    loadOptions();
    form.addEventListener('submit', e=>{
      e.preventDefault();
      const name = nameInput.value.trim();
      const option = optionInput.value.trim();
      const enteredUnit = (unitInput && unitInput.value || '').trim();
      const suggested = optionsMap[option] || '';
      const qty = parseInt(quantityInput.value,10)||1;
      if(!name){ showMsg('Escribe un nombre', false); return; }
      if(!option){ showMsg('Selecciona o escribe un pedido', false); return; }
      // optional: verify option exists in datalist
      const available = Array.from(optionsList.options).map(o=>o.value);
      if(available.length && !available.includes(option)){
        // allow custom but warn
      }
      const submissions = getSubmissions();
      // determinar la unidad final: preferir la escrita, si no reconocida usar la más cercana
      const finalUnit = matchUnit(enteredUnit || suggested, unitsArr);
      const entry = {name,option,unit:finalUnit,quantity:qty,ts:new Date().toISOString()};

      // intentar enviar al servidor si está disponible
      const SERVER_BASE = window.SERVER_BASE || '';
      if(SERVER_BASE){
        fetch((SERVER_BASE||'') + '/submit', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(entry)}).then(r=>{
          if(!r.ok) throw new Error('server');
          showMsg('Pedido enviado al servidor.');
        }).catch(()=>{
          // fallback local
          submissions.push(entry);
          saveSubmissions(submissions);
          showMsg('Servidor no disponible — guardado localmente.');
        });
      }else{
        submissions.push(entry);
        saveSubmissions(submissions);
        showMsg('Pedido guardado localmente.');
      }

      form.reset();
      if(unitInput) unitInput.value = '';
      if(finalUnit && finalUnit !== (enteredUnit||'')) showMsg('Medida ajustada a "'+finalUnit+'".');
      // actualizar datalist (por si hubo cambios)
      if(unitsList && unitsArr.length){ unitsList.innerHTML=''; unitsArr.forEach(u=>{const o=document.createElement('option'); o.value=u; unitsList.appendChild(o);}); }
    });
  }

  // Admin page logic
  const table = document.querySelector('#submissionsTable tbody');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const refreshFilesBtn = document.getElementById('refreshFilesBtn');
  const serverFilesSpan = document.getElementById('serverFiles');
  const downloadMasterBtn = document.getElementById('downloadMasterBtn');
  const downloadJsonBtn = document.getElementById('downloadJsonBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const searchInput = document.getElementById('searchInput');
  const emptyDiv = document.getElementById('empty');

  function renderTable(){
    if(!table) return;
    const SERVER_BASE = window.SERVER_BASE || '';
    if(SERVER_BASE){
      fetch((SERVER_BASE||'') + '/submissions').then(r=>r.json()).then(serverList=>{
        const list = Array.isArray(serverList)? serverList : [];
        renderRowsAndHistory(list);
      }).catch(()=>{
        // si falla el servidor, mostrar local
        const allLocal = getSubmissions();
        renderRowsAndHistory(allLocal);
      });
    }else{
      const allLocal = getSubmissions();
      renderRowsAndHistory(allLocal);
    }
  }

  function renderRowsAndHistory(all){
    const q = (searchInput && searchInput.value || '').toLowerCase();
    const filtered = all.filter(s=> s.name.toLowerCase().includes(q) || s.option.toLowerCase().includes(q));
    table.innerHTML = '';
    if(filtered.length===0){ emptyDiv.style.display='block'; } else { emptyDiv.style.display='none'; }
    filtered.forEach((s,idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.option)}</td><td>${escapeHtml(s.unit||'')}</td><td>${s.quantity}</td><td>${new Date(s.ts).toLocaleString()}</td><td><button class="action-btn" data-i="${idx}">Eliminar</button></td>`;
      table.appendChild(tr);
    });
    // attach delete handlers
    Array.from(table.querySelectorAll('button.action-btn')).forEach(b=>{
      b.addEventListener('click', ()=>{
        const i = parseInt(b.dataset.i,10);
        const all = getSubmissions();
        const q = (searchInput && searchInput.value || '').toLowerCase();
        const filteredLocal = all.filter(s=> s.name.toLowerCase().includes(q) || s.option.toLowerCase().includes(q));
        const item = filteredLocal[i];
        if(!item) return;
        const remaining = all.filter(s=> s.ts !== item.ts);
        saveSubmissions(remaining);
        renderTable();
      });
    });

    // historial: mostrar últimos 8
    const historyEl = document.getElementById('historyList');
    if(historyEl){
      const recent = (all.slice(-8).reverse() || []).map(s=> `${s.name} → ${s.option} (${s.quantity} ${s.unit||''})`);
      historyEl.textContent = recent.join(' · ');
    }
  }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  if(exportBtn){
    exportBtn.addEventListener('click', ()=>{
      const all = getSubmissions();
      if(!all.length){ showMsg('No hay datos para exportar', false); return; }
      // Preferir generar .xlsx con SheetJS si está disponible
      try{
        if(window.XLSX){
          const header = ['Nombre','Pedido','Medida','Cantidad','Fecha'];
          const rows = all.map(r=>[r.name,r.option,r.unit||'',r.quantity,new Date(r.ts).toLocaleString()]);
          const aoa = [header, ...rows];
          const ws = XLSX.utils.aoa_to_sheet(aoa);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
          XLSX.writeFile(wb, 'pedidos.xlsx');
          return;
        }
      }catch(e){ console.warn('SheetJS error', e); }
      // fallback a CSV
      const header = ['Nombre','Pedido','Medida','Cantidad','Fecha'];
      const rows = all.map(r=>[r.name,r.option,r.unit||'',r.quantity,new Date(r.ts).toLocaleString()]);
      let csv = '\uFEFF' + header.join(',') + '\n' + rows.map(r=> r.map(c=> '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'pedidos.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });
  }

  if(clearBtn){ clearBtn.addEventListener('click', ()=>{ if(confirm('Eliminar todos los pedidos?')){ saveSubmissions([]); renderTable(); } }); }
  if(searchInput){ searchInput.addEventListener('input', renderTable); }

  // mostrar unidad en index cuando se escribe/selecciona una opción
  if(optionInput){
    optionInput.addEventListener('input', ()=>{
      const val = optionInput.value.trim();
      const u = optionsMap[val] || '';
      if(unitInput) unitInput.value = u ? u : '';
      updateSuggestions(val);
    });
    optionInput.addEventListener('focus', ()=> updateSuggestions(optionInput.value.trim()));
    optionInput.addEventListener('blur', ()=> setTimeout(()=>{ if(optionSuggestions) optionSuggestions.style.display='none'; },200));
  }

  // sugerencias para el campo 'qué quiere' (combina opciones y historial)
  function getCandidates(){
    const candidates = new Set(Object.keys(optionsMap || {}));
    const local = getSubmissions();
    local.forEach(s=>{ if(s.option) candidates.add(s.option); });
    return Array.from(candidates);
  }

  function scoreCandidate(q, cand){
    if(!q) return 0;
    const a = cand.toLowerCase(), b = q.toLowerCase();
    if(a===b) return -100;
    if(a.startsWith(b)) return -10;
    if(a.includes(b)) return -5;
    const dist = levenshtein(a,b);
    return dist + 10;
  }

  function updateSuggestions(q){
    if(!optionSuggestions) return;
    const list = getCandidates();
    if(!q){
      // mostrar recientes
      const recent = getSubmissions().slice(-6).reverse().map(s=>s.option).filter(Boolean);
      const uniq = [...new Set(recent)];
      optionSuggestions.innerHTML = uniq.map(u=>`<div class="item">${escapeHtml(u)} <div class="muted">reciente</div></div>`).join('') || '<div class="muted">Sin historial</div>';
      optionSuggestions.style.display = 'block';
      attachSuggestionClicks();
      return;
    }
    const scored = list.map(c=> ({c, s: scoreCandidate(q,c)})).sort((a,b)=>a.s-b.s).slice(0,8);
    if(scored.length===0){ optionSuggestions.innerHTML = '<div class="muted">No hay coincidencias</div>'; optionSuggestions.style.display='block'; attachSuggestionClicks(); return; }
    optionSuggestions.innerHTML = scored.map(x=>`<div class="item">${escapeHtml(x.c)}</div>`).join('');
    optionSuggestions.style.display='block';
    attachSuggestionClicks();
  }

  function attachSuggestionClicks(){
    if(!optionSuggestions) return;
    Array.from(optionSuggestions.querySelectorAll('.item')).forEach(el=>{
      el.onclick = ()=>{
        const val = el.textContent.trim();
        optionInput.value = val;
        const u = optionsMap[val] || '';
        if(unitInput) unitInput.value = u;
        optionSuggestions.style.display = 'none';
      };
    });
  }

  // función de distancia Levenshtein para coincidencias aproximadas
  function levenshtein(a,b){
    if(a===b) return 0; if(!a) return b.length; if(!b) return a.length;
    const m = a.length, n = b.length; let dp = Array(n+1).fill(0).map((_,j)=>j);
    for(let i=1;i<=m;i++){ let prev = i; for(let j=1;j<=n;j++){ const tmp = dp[j]; const cost = a[i-1]===b[j-1]?0:1; dp[j] = Math.min(dp[j]+1, dp[j-1]+1, prev+cost); prev = tmp; } }
    return dp[n];
  }

  function matchUnit(input, list){
    if(!input) return '';
    if(!list || !list.length) return input;
    if(list.includes(input)) return input;
    // buscar la más cercana por distancia
    let best = list[0]; let bestScore = levenshtein(input.toLowerCase(), best.toLowerCase());
    for(let i=1;i<list.length;i++){ const u=list[i]; const s=levenshtein(input.toLowerCase(), u.toLowerCase()); if(s<bestScore){ bestScore=s; best=u; } }
    return best;
  }

  // initial render for admin
  renderTable();

  // funciones para listar/descargar archivos del servidor
  const SERVER_BASE = window.SERVER_BASE || '';
  async function fetchServerFiles(){
    if(!SERVER_BASE) return;
    try{
      const r = await fetch(SERVER_BASE + '/files');
      if(!r.ok) throw new Error('no');
      const files = await r.json();
      if(!serverFilesSpan) return;
      if(!files || !files.length){ serverFilesSpan.textContent = 'No hay archivos'; return; }
      serverFilesSpan.innerHTML = files.map(f=> `<a class="server-file" href="#" data-name="${encodeURIComponent(f.name)}">${f.name}</a>`).join(' · ');
      // attach clicks
      Array.from(document.querySelectorAll('.server-file')).forEach(el=>{
        el.addEventListener('click', (ev)=>{
          ev.preventDefault(); const name = decodeURIComponent(el.dataset.name||''); const url = SERVER_BASE + '/files/' + encodeURIComponent(name);
          const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        });
      });
    }catch(e){ console.warn('fetchServerFiles', e.message); if(serverFilesSpan) serverFilesSpan.textContent = 'Error al leer archivos'; }
  }

  if(refreshFilesBtn){ refreshFilesBtn.addEventListener('click', ()=> fetchServerFiles()); }
  if(downloadMasterBtn){ downloadMasterBtn.addEventListener('click', ()=>{ if(!SERVER_BASE) return showMsg('Configura SERVER_BASE para usar servidor', false); const a=document.createElement('a'); a.href = SERVER_BASE + '/download/enf'; a.download='submissions.enf'; document.body.appendChild(a); a.click(); a.remove(); }); }
  if(downloadJsonBtn){ downloadJsonBtn.addEventListener('click', ()=>{ if(!SERVER_BASE) return showMsg('Configura SERVER_BASE para usar servidor', false); const a=document.createElement('a'); a.href = SERVER_BASE + '/download/json'; a.download='submissions.json'; document.body.appendChild(a); a.click(); a.remove(); }); }
  if(downloadCsvBtn){ downloadCsvBtn.addEventListener('click', ()=>{ if(!SERVER_BASE) return showMsg('Configura SERVER_BASE para usar servidor', false); const a=document.createElement('a'); a.href = SERVER_BASE + '/export/csv'; a.download='pedidos.csv'; document.body.appendChild(a); a.click(); a.remove(); }); }

  // auto-fetch files on load if server configured
  if(SERVER_BASE) fetchServerFiles();

})();

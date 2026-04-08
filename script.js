const SUPABASE_URL = 'https://lleveuxsfkjzpoxwlhqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZXZldXhzZmtqenBveHdsaHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQzNDEsImV4cCI6MjA5MTE5MDM0MX0.FjW9SWaPgRJfqgnzD3HIFtz3ea-pmnFMdbh_vq5jmyQ';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const tableBody = document.getElementById('teamsTableBody');
const soloTableBody = document.getElementById('soloTableBody');

let teamsData = []; 
let soloData = [];
let targetTeamForNewMember = null; 
let currentFilter = 'all'; 
let currentSoloFilter = 'all'; // Фильтр для соло: 'all', 'arrived', 'absent'
let currentView = 'teams'; // 'teams' или 'solo'
let soloMoveTargetId = null;

// --- ИНИЦИАЛИЗАЦИЯ ---
async function init() {
    const { data: { user } } = await db.auth.getUser();
    
    if (document.getElementById('admin-content')) {
        if (user) {
            document.getElementById('admin-content').style.display = 'block';
            if (document.getElementById('userEmail')) {
                document.getElementById('userEmail').innerText = `Signed in as: ${user.email}`;
            }
            createModalHTML(); 
            loadData();
            setupRealtime();
        } else {
            window.location.href = 'index.html'; 
        }
    }

    if (document.getElementById('loginForm')) {
        if (user) window.location.href = 'admin.html'; 
    }
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('emailAuth').value;
        const password = document.getElementById('passwordAuth').value;
        const btn = loginForm.querySelector('button');
        btn.innerText = 'Вход...'; btn.disabled = true;

        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) {
            alert("Ошибка входа.");
            btn.innerText = 'Войти в систему'; btn.disabled = false;
        } else {
            window.location.href = 'admin.html';
        }
    });
}

async function loginWithGoogle() {
    const { data, error } = await db.auth.signInWithOAuth({
        provider: 'google',
    });
    
    if (error) {
        console.error("Ошибка входа:", error.message);
        alert("Не удалось войти через Google");
    }
}

window.logout = async function() {
    await db.auth.signOut();
    window.location.href = 'index.html';
};

function setupRealtime() {
    db.channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'solo' }, () => loadData())
    .subscribe();
}

const splitData = (str) => {
    if (!str || typeof str !== 'string' || str.trim() === '') return [];
    return str.split(',').map(s => s.trim()).filter(s => s !== '');
};

// --- ЗАГРУЗКА И СТАТИСТИКА ---
async function loadData() {
    try {
        const [teamsRes, soloRes] = await Promise.all([
            db.from('teams').select('*').order('team', { ascending: true }),
            db.from('solo').select('*').order('name', { ascending: true })
        ]);

        if (teamsRes.error) throw teamsRes.error;
        if (soloRes.error) throw soloRes.error;

        teamsData = teamsRes.data || [];
        soloData = soloRes.data || [];

        calcGlobalStats();
        window.renderCurrentView();

    } catch (e) {
        console.error("Ошибка загрузки:", e);
    }
}

function calcGlobalStats() {
    let total = 0;
    let arrived = 0;

    // Считаем команды
    teamsData.forEach(t => {
        total++; // Лидер
        if (t.arrived_leader) arrived++;

        const mArr = splitData(t.members);
        const aArr = splitData(t.arrived_members);
        total += mArr.length;
        for (let i = 0; i < mArr.length; i++) {
            if (aArr[i] === 'true') arrived++;
        }
    });

    // Считаем соло
    soloData.forEach(s => {
        total++;
        if (s.arrived) arrived++;
    });

    document.getElementById('globalTotal').innerText = total;
    document.getElementById('globalArrived').innerText = arrived;
}

// --- УПРАВЛЕНИЕ ВИДАМИ (КОМАНДЫ / СОЛО) ---
window.switchView = function(view) {
    currentView = view;
    document.getElementById('btnViewTeams').classList.toggle('active', view === 'teams');
    document.getElementById('btnViewSolo').classList.toggle('active', view === 'solo');

    document.getElementById('teamsContainer').style.display = view === 'teams' ? 'block' : 'none';
    document.getElementById('soloContainer').style.display = view === 'solo' ? 'block' : 'none';

    document.getElementById('pageTitle').innerText = view === 'teams' ? 'Все команды' : 'Соло участники';
    
    window.renderCurrentView();
};

window.renderCurrentView = function() {
    if (currentView === 'teams') renderTeams();
    else renderSolo();
};

window.setFilter = function(status) {
    if (currentView !== 'teams') return; // Фильтр только для команд
    currentFilter = currentFilter === status ? 'all' : status;
    window.renderTeams();
};

window.setSoloFilter = function(status) {
    if (currentView !== 'solo') return;
    // Если кликаем по активному фильтру — сбрасываем на 'all'
    currentSoloFilter = currentSoloFilter === status ? 'all' : status;
    window.renderSolo();
};

// --- ФУНКЦИИ ОБНОВЛЕНИЯ КОМАНД (Оставлены без изменений) ---
window.updateField = async function(teamName, column, newValue) {
    const team = teamsData.find(t => t.team === teamName);
    if (team) team[column] = newValue;
    await db.from('teams').update({ [column]: newValue }).eq('team', teamName);
};

window.updateArrayField = async function(teamName, column, index, newValue) {
    const team = teamsData.find(t => t.team === teamName);
    if (!team) return;
    let arr = splitData(team[column]);
    while (arr.length <= index) arr.push('');
    arr[index] = newValue.replace(/,/g, '').trim(); 
    const joinedValue = arr.join(', ');
    team[column] = joinedValue;
    await db.from('teams').update({ [column]: joinedValue }).eq('team', teamName);
};

window.updateLeaderArrival = async function(teamName, isChecked) {
    const team = teamsData.find(t => t.team === teamName);
    if (team) team.arrived_leader = isChecked;
    calcGlobalStats();
    await db.from('teams').update({ arrived_leader: isChecked }).eq('team', teamName);
    window.renderTeams();
};

window.updateMemberArrival = async function(teamName, index, isChecked) {
    const team = teamsData.find(t => t.team === teamName);
    if (!team) return;
    let aArr = splitData(team.arrived_members);
    while (aArr.length <= index) aArr.push('false');
    aArr[index] = isChecked ? 'true' : 'false';
    team.arrived_members = aArr.join(', ');
    calcGlobalStats();
    await db.from('teams').update({ arrived_members: team.arrived_members }).eq('team', teamName);
    window.renderTeams();
};

window.deleteTeam = async function(teamName) {
    if (confirm(`Удалить команду "${teamName}"?`)) {
        teamsData = teamsData.filter(t => t.team !== teamName);
        calcGlobalStats(); window.renderTeams();
        await db.from('teams').delete().eq('team', teamName);
    }
};

window.deleteMember = async function(teamName, index) {
    const team = teamsData.find(t => t.team === teamName);
    if (!team || !confirm('Удалить участника?')) return;
    let mArr = splitData(team.members), tArr = splitData(team.tgs), nArr = splitData(team.numbers), aArr = splitData(team.arrived_members);
    mArr.splice(index, 1); tArr.splice(index, 1); nArr.splice(index, 1); aArr.splice(index, 1);
    const updateData = { members: mArr.join(', '), tgs: tArr.join(', '), numbers: nArr.join(', '), arrived_members: aArr.join(', '), team_len: mArr.length + 1 };
    Object.assign(team, updateData);
    calcGlobalStats(); window.renderTeams();
    await db.from('teams').update(updateData).eq('team', teamName);
};

// --- ФУНКЦИИ СОЛО ---
window.updateSoloField = async function(id, column, newValue) {
    const solo = soloData.find(s => s.id === id);
    if (solo) solo[column] = newValue;
    await db.from('solo').update({ [column]: newValue }).eq('id', id);
};

window.updateSoloArrival = async function(id, isChecked) {
    const solo = soloData.find(s => s.id === id);
    if (solo) solo.arrived = isChecked;
    calcGlobalStats();
    await db.from('solo').update({ arrived: isChecked }).eq('id', id);
};

window.deleteSolo = async function(id) {
    if (confirm('Удалить соло-участника?')) {
        soloData = soloData.filter(s => s.id !== id);
        calcGlobalStats(); window.renderSolo();
        await db.from('solo').delete().eq('id', id);
    }
};

// Перенос в команду
window.openMoveModal = function(soloId) {
    soloMoveTargetId = soloId;
    const select = document.getElementById('selectTeamForMove');
    select.innerHTML = '<option value="">Выберите команду...</option>';
    teamsData.forEach(t => {
        select.innerHTML += `<option value="${t.team}">${t.team}</option>`;
    });
    document.getElementById('moveSoloModal').style.display = 'flex';
};

window.closeMoveModal = function() {
    document.getElementById('moveSoloModal').style.display = 'none';
};

window.confirmMoveSolo = async function() {
    const teamName = document.getElementById('selectTeamForMove').value;
    if (!teamName || !soloMoveTargetId) return;

    const solo = soloData.find(s => s.id === soloMoveTargetId);
    const team = teamsData.find(t => t.team === teamName);
    if (!solo || !team) return;

    // 1. Добавляем в локальный массив команды
    let mArr = splitData(team.members);
    let tArr = splitData(team.tgs);
    let nArr = splitData(team.numbers);
    let aArr = splitData(team.arrived_members);

    mArr.push(solo.name || 'Без имени');
    tArr.push(solo.tg || '');
    nArr.push(solo.number || '');
    aArr.push(solo.arrived ? 'true' : 'false');

    const updateData = {
        members: mArr.join(', '),
        tgs: tArr.join(', '),
        numbers: nArr.join(', '),
        arrived_members: aArr.join(', '),
        team_len: mArr.length + 1
    };

    Object.assign(team, updateData);
    soloData = soloData.filter(s => s.id !== soloMoveTargetId); // 2. Удаляем локально из соло

    closeMoveModal();
    calcGlobalStats();
    window.renderCurrentView();

    // 3. Отправляем в базу
    await db.from('teams').update(updateData).eq('team', teamName);
    await db.from('solo').delete().eq('id', soloMoveTargetId);
};

// --- МОДАЛКИ ---
function createModalHTML() {
    if (!document.getElementById('addMemberModal')) {
        const modalHTML = `
        <div id="addMemberModal" class="modal-overlay" style="display:none;">
            <div class="modal-content">
                <h3 class="modal-title">Новый участник</h3>
                <div class="modal-field"><label>Имя</label><input type="text" id="modalName"></div>
                <div class="modal-field"><label>Telegram</label><input type="text" id="modalTg"></div>
                <div class="modal-field"><label>Телефон</label><input type="text" id="modalPhone"></div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="window.closeModal()">Отмена</button>
                    <button class="btn-primary" id="btnSaveAdd">Сохранить</button>
                </div>
            </div>
        </div>
        
        <div id="moveSoloModal" class="modal-overlay" style="display:none;">
            <div class="modal-content" style="max-width: 400px;">
                <h3 class="modal-title">Перенос в команду</h3>
                <p style="font-size: 0.9rem; color: gray; margin-bottom: 15px;">Найдите команду для участника:</p>
                
                <div class="modal-field">
                    <input type="text" id="searchTeamInput" placeholder="Поиск команды..." style="width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;" onkeyup="window.filterTeamsInModal()">
                    
                    <select id="selectTeamForMove" size="6" style="width: 100%; padding: 5px; border-radius: 6px; border: 1px solid #ccc; outline: none;"></select>
                </div>

                <div class="modal-actions" style="margin-top: 20px;">
                    <button class="btn-secondary" onclick="window.closeMoveModal()">Отмена</button>
                    <button class="btn-primary" onclick="window.confirmMoveSolo()">Перенести</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        document.getElementById('btnSaveAdd').addEventListener('click', window.saveNewMember);
    }
}

window.openAddModal = function(teamName) {
    targetTeamForNewMember = teamName;
    document.getElementById('addMemberModal').style.display = 'flex';
};
window.closeModal = function() { document.getElementById('addMemberModal').style.display = 'none'; };

window.saveNewMember = async function() {
    const team = teamsData.find(t => t.team === targetTeamForNewMember);
    if (!team) return;
    let mArr = splitData(team.members), tArr = splitData(team.tgs), nArr = splitData(team.numbers), aArr = splitData(team.arrived_members);
    mArr.push(document.getElementById('modalName').value.trim() || 'Новый');
    tArr.push(document.getElementById('modalTg').value.trim());
    nArr.push(document.getElementById('modalPhone').value.trim());
    aArr.push('false');

    const updateData = { members: mArr.join(', '), tgs: tArr.join(', '), numbers: nArr.join(', '), arrived_members: aArr.join(', '), team_len: mArr.length + 1 };
    Object.assign(team, updateData);
    calcGlobalStats(); window.renderTeams(); window.closeModal();
    await db.from('teams').update(updateData).eq('team', targetTeamForNewMember);
};

// --- ФИЛЬТРАЦИЯ КОМАНД В МОДАЛКЕ ---
window.filterTeamsInModal = function() {
    const term = document.getElementById('searchTeamInput').value.toLowerCase();
    const select = document.getElementById('selectTeamForMove');
    select.innerHTML = '';
    
    // Фильтруем команды и добавляем в список (select)
    const filtered = teamsData.filter(t => t.team.toLowerCase().includes(term));
    filtered.forEach(t => {
        select.innerHTML += `<option value="${t.team}" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;">${t.team}</option>`;
    });
};

// Обновляем открытие модалки, чтобы сбрасывать поиск
window.openMoveModal = function(soloId) {
    soloMoveTargetId = soloId;
    document.getElementById('searchTeamInput').value = ''; // Очищаем строку поиска
    window.filterTeamsInModal(); // Загружаем полный список команд
    document.getElementById('moveSoloModal').style.display = 'flex';
};

// --- ФУНКЦИЯ: ВЫГНАТЬ В СОЛО ---
window.kickMember = async function(teamName, index) {
    const team = teamsData.find(t => t.team === teamName);
    if (!team) return;
    
    let mArr = splitData(team.members);
    let tArr = splitData(team.tgs);
    let nArr = splitData(team.numbers);
    let aArr = splitData(team.arrived_members);

    const kickedName = mArr[index] || 'Неизвестный';
    const kickedTg = tArr[index] || '';
    const kickedNumber = nArr[index] || '';
    const kickedArrived = aArr[index] === 'true';

    if (!confirm(`Перевести участника "${kickedName}" в список соло?`)) return;

    // 1. Удаляем из массивов команды
    mArr.splice(index, 1); 
    tArr.splice(index, 1); 
    nArr.splice(index, 1); 
    aArr.splice(index, 1);

    // 2. Готовим данные (ВАЖНО: больше не меняем team_len, чтобы пустое место в команде оставалось открытым слотом)
    const updateData = { 
        members: mArr.join(', '), 
        tgs: tArr.join(', '), 
        numbers: nArr.join(', '), 
        arrived_members: aArr.join(', ')
    };

    const newSolo = {
        name: kickedName,
        tg: kickedTg,
        number: kickedNumber,
        email: '', 
        arrived: kickedArrived
    };

    // 3. Сначала дожидаемся ответа от базы данных, а только потом обновляем интерфейс
    try {
        // Показываем пользователю, что идет загрузка (меняем курсор на часики)
        document.body.style.cursor = 'wait';
        
        await db.from('teams').update(updateData).eq('team', teamName);
        await db.from('solo').insert([newSolo]);
        
        // Как только база успешно сохранила перенос — заново скачиваем актуальные данные.
        // Это автоматически выровняет все массивы и вызовет правильный calcGlobalStats()
        if (typeof loadData === 'function') {
            await loadData();
        } else {
            // Запасной вариант, если функция называется иначе
            location.reload(); 
        }
        
    } catch (e) {
        console.error("Ошибка при переводе в соло:", e);
        alert("Произошла ошибка при сохранении в базу.");
    } finally {
        // Возвращаем обычный курсор
        document.body.style.cursor = 'default';
    }
};

// --- ОТРИСОВКА ---
window.renderTeams = function() {
    const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase();
    let absentCount = 0, partialCount = 0, fullCount = 0;

    const filtered = teamsData.filter(item => {
        const searchString = `${item.team} ${item.leader} ${item.members}`.toLowerCase();
        return searchString.includes(searchTerm);
    });

    filtered.forEach(item => {
        const maxLen = Math.max(splitData(item.members).length, splitData(item.tgs).length, 0);
        let arrived = item.arrived_leader ? 1 : 0;
        const aArr = splitData(item.arrived_members);
        for (let i = 0; i < maxLen; i++) if (aArr[i] === 'true') arrived++;
        
        const total = maxLen + 1;
        if (arrived === 0) { item._status = 'absent'; absentCount++; }
        else if (arrived === total && total > 0) { item._status = 'full'; fullCount++; }
        else { item._status = 'partial'; partialCount++; }
        
        item._arrived = arrived; item._total = total; item._maxLen = maxLen;
    });

    const finalData = filtered.filter(item => currentFilter === 'all' || item._status === currentFilter);
    tableBody.innerHTML = '';

    finalData.forEach(item => {
        let rosterHTML = '<div class="members-list">';
        rosterHTML += `
            <div class="member-card leader-card">
                <div class="leader-badge">Лидер</div>
                <div class="member-name">
                    <input type="checkbox" class="arrival-checkbox" ${item.arrived_leader ? 'checked' : ''} onchange="window.updateLeaderArrival('${item.team}', this.checked)">
                    👤 <span contenteditable="true" onblur="window.updateField('${item.team}', 'leader', this.innerText)">${item.leader || ''}</span>
                </div>
                <div class="member-contacts">
                    <span>💬 <span contenteditable="true" onblur="window.updateField('${item.team}', 'tg', this.innerText)">${item.tg || ''}</span></span>
                    <span>📞 <span contenteditable="true" onblur="window.updateField('${item.team}', 'number', this.innerText)">${item.number || ''}</span></span>
                </div>
            </div>`;

        const mArr = splitData(item.members), tArr = splitData(item.tgs), nArr = splitData(item.numbers), aArr = splitData(item.arrived_members);
        for (let i = 0; i < item._maxLen; i++) {
            rosterHTML += `
                <div class="member-card" style="position: relative; padding-bottom: 36px;">
                    
                    <div class="member-name">
                        <input type="checkbox" class="arrival-checkbox" ${aArr[i] === 'true' ? 'checked' : ''} onchange="window.updateMemberArrival('${item.team}', ${i}, this.checked)">
                        👤 <span contenteditable="true" onblur="window.updateArrayField('${item.team}', 'members', ${i}, this.innerText)">${mArr[i] || ''}</span>
                    </div>
                    
                    <div class="member-contacts">
                        <span>💬 <span contenteditable="true" onblur="window.updateArrayField('${item.team}', 'tgs', ${i}, this.innerText)">${tArr[i] || ''}</span></span>
                        <span>📞 <span contenteditable="true" onblur="window.updateArrayField('${item.team}', 'numbers', ${i}, this.innerText)">${nArr[i] || ''}</span></span>
                    </div>

                    <div style="position: absolute; bottom: 8px; right: 8px; display: flex; gap: 4px;">
                        <button onclick="window.kickMember('${item.team}', ${i})" title="Перевести в соло" style="background: #fffad2; color: #854d0e; border: 1px solid #fceb97; border-radius: 6px; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; padding: 0; transition: 0.2s;">🚶</button>
                        <button onclick="window.deleteMember('${item.team}', ${i})" title="Удалить участника насовсем" style="background: #fecaca; color: #991b1b; border: 1px solid #fca5a5; border-radius: 6px; cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; padding: 0; transition: 0.2s;">✖</button>
                    </div>

                </div>`;
        }
        rosterHTML += `<div class="member-card btn-add-member-card" onclick="window.openAddModal('${item.team}')"><span>➕ Добавить</span></div></div>`;

        tableBody.innerHTML += `<tr>
            <td style="vertical-align: top;">
                <div class="team-design-card">
                    <div contenteditable="true" onblur="window.updateField('${item.team}', 'team', this.innerText)" class="team-name-big">${item.team}</div>
                    <div style="display:flex; gap:6px; margin-bottom:12px;">
                        <div class="team-size-wrap">Всего: <span class="team-size-number">${item._total}</span></div>
                        <div class="team-size-wrap">Пришли: <span class="team-arrived-badge" style="background:${item._arrived===0?'#ef4444':'#10b981'}">${item._arrived}</span></div>
                    </div>
                    <button class="btn-delete-compact" onclick="window.deleteTeam('${item.team}')">Удалить</button>
                </div>
            </td>
            <td>${rosterHTML}</td>
        </tr>`;
    });

    const stats = document.getElementById('stats');
    if (stats) stats.innerHTML = `
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <span style="font-size: 1rem; cursor:pointer; border-bottom:${currentFilter==='all'?'2px solid var(--primary)':'none'}" onclick="window.setFilter('all')">Показано: ${finalData.length}/${absentCount+partialCount+fullCount}</span>
            <span class="stat-badge badge-absent ${currentFilter==='absent'?'active':''}" onclick="window.setFilter('absent')">❌ Не пришли: <b>${absentCount}</b></span>
            <span class="stat-badge badge-partial ${currentFilter==='partial'?'active':''}" onclick="window.setFilter('partial')">⏳ Частично: <b>${partialCount}</b></span>
            <span class="stat-badge badge-full ${currentFilter==='full'?'active':''}" onclick="window.setFilter('full')">✅ Вся команда: <b>${fullCount}</b></span>
        </div>`;
};
window.renderSolo = function() {
    const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase();
    
    // 1. Сначала ищем по тексту
    const searched = soloData.filter(item => {
        const searchString = `${item.name} ${item.tg} ${item.email} ${item.number}`.toLowerCase();
        return searchString.includes(searchTerm);
    });

    // 2. Считаем статистику для плашек
    let arrivedCount = 0;
    let absentCount = 0;
    searched.forEach(item => {
        if (item.arrived) arrivedCount++;
        else absentCount++;
    });

    // 3. Применяем фильтр (пришел/не пришел)
    const filtered = searched.filter(item => {
        if (currentSoloFilter === 'all') return true;
        if (currentSoloFilter === 'arrived') return item.arrived === true;
        if (currentSoloFilter === 'absent') return item.arrived === false;
    });

    soloTableBody.innerHTML = '';

    // 4. Отрисовываем фильтры в шапке
    const stats = document.getElementById('stats');
    if (stats) {
        stats.innerHTML = `
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <span style="font-size: 1rem; cursor:pointer; border-bottom:${currentSoloFilter === 'all' ? '2px solid var(--primary)' : 'none'}" onclick="window.setSoloFilter('all')">Показано: ${filtered.length}/${arrivedCount+absentCount}</span>
            
            <span onclick="window.setSoloFilter('absent')" style="background: ${currentSoloFilter === 'absent' ? '#fca5a5' : '#fef2f2'}; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-size: 0.9rem; border: 1px solid #fecaca; cursor: pointer; transition: 0.2s;">
                ❌ Не пришли: <b>${absentCount}</b>
            </span>
            
            <span onclick="window.setSoloFilter('arrived')" style="background: ${currentSoloFilter === 'arrived' ? '#6ee7b7' : '#ecfdf5'}; color: #059669; padding: 4px 10px; border-radius: 6px; font-size: 0.9rem; border: 1px solid #a7f3d0; cursor: pointer; transition: 0.2s;">
                ✅ Пришли: <b>${arrivedCount}</b>
            </span>
        </div>`;
    }

    // 5. Проверка на пустоту (после отрисовки фильтров!)
    if (filtered.length === 0) {
        soloTableBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    Нет участников, подходящих под фильтр.
                </td>
            </tr>`;
        return;
    }

    // 6. Отрисовка карточек
    filtered.forEach(item => {
        soloTableBody.innerHTML += `
        <tr>
            <td>
                <div class="member-name" style="font-size: 1.1rem; margin-bottom: 8px;">
                    <input type="checkbox" class="arrival-checkbox" ${item.arrived ? 'checked' : ''} onchange="window.updateSoloArrival(${item.id}, this.checked)" style="transform: scale(1.3); margin-right: 10px;">
                    👤 <span contenteditable="true" onblur="window.updateSoloField(${item.id}, 'name', this.innerText)">${item.name || 'Без имени'}</span>
                </div>
            </td>
            <td>
                <div class="member-contacts" style="display: flex; flex-direction: column; gap: 4px;">
                    <span>💬 <span contenteditable="true" onblur="window.updateSoloField(${item.id}, 'tg', this.innerText)">${item.tg || '---'}</span></span>
                    <span>📞 <span contenteditable="true" onblur="window.updateSoloField(${item.id}, 'number', this.innerText)">${item.number || '---'}</span></span>
                    <span>📧 <span contenteditable="true" onblur="window.updateSoloField(${item.id}, 'email', this.innerText)">${item.email || '---'}</span></span>
                </div>
            </td>
            <td style="vertical-align: middle;">
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="window.openMoveModal(${item.id})">В команду</button>
                    <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.85rem; color: #ef4444; border-color: #fca5a5;" onclick="window.deleteSolo(${item.id})">Удалить</button>
                </div>
            </td>
        </tr>`;
    });
};

init();
const SUPABASE_URL = 'https://lleveuxsfkjzpoxwlhqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZXZldXhzZmtqenBveHdsaHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQzNDEsImV4cCI6MjA5MTE5MDM0MX0.FjW9SWaPgRJfqgnzD3HIFtz3ea-pmnFMdbh_vq5jmyQ';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const tableBody = document.getElementById('teamsTableBody');
let teamsData = []; 
let targetTeamForNewMember = null; 

// --- ИНИЦИАЛИЗАЦИЯ ---
async function init() {
    const { data: { user } } = await db.auth.getUser();
    
    if (document.getElementById('admin-content')) {
        if (user) {
            document.getElementById('admin-content').style.display = 'block';
            
            const userEmailSpan = document.getElementById('userEmail');
            if (userEmailSpan) {
                userEmailSpan.innerText = `Signed in as: ${user.email}`;
            }

            createModalHTML(); 
            loadTeams();
            setupRealtime();
        } else {
            window.location.href = 'index.html'; 
        }
    }

    if (document.getElementById('loginForm')) {
        if (user) {
            window.location.href = 'admin.html'; 
        }
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
            alert("Ошибка входа: Неверный логин или пароль.");
            btn.innerText = 'Войти в систему'; btn.disabled = false;
        } else {
            window.location.href = 'admin.html';
        }
    });
}

window.logout = async function() {
    await db.auth.signOut();
    window.location.href = 'index.html';
};

function setupRealtime() {
    db.channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => { loadTeams(); })
    .subscribe();
}

const splitData = (str) => {
    if (!str || typeof str !== 'string' || str.trim() === '') return [];
    return str.split(/,|\n/).map(s => s.trim());
};

// --- ГЛОБАЛЬНЫЕ ФУНКЦИИ ---
window.updateField = async function(teamName, column, newValue) {
    const { error } = await db.from('teams').update({ [column]: newValue }).eq('team', teamName);
    if (error) { alert("Ошибка: " + error.message); loadTeams(); }
};

window.updateArrayField = async function(teamName, column, index, newValue) {
    const team = teamsData.find(t => t.team === teamName);
    if (!team) return;

    let arr = splitData(team[column]);
    while (arr.length <= index) arr.push('');
    arr[index] = newValue.replace(/,/g, '').trim(); 
    await window.updateField(teamName, column, arr.join(', '));
};

// --- СОХРАНЕНИЕ ЧЕКБОКСОВ (НОВОЕ) ---
window.updateLeaderArrival = async function(teamName, isChecked) {
    const { error } = await db.from('teams').update({ arrived_leader: isChecked }).eq('team', teamName);
    if (error) alert("Ошибка сохранения: " + error.message);
    loadTeams();
};

window.updateMemberArrival = async function(teamName, index, isChecked) {
    const team = teamsData.find(t => t.team === teamName);
    if (!team) return;

    let aArr = splitData(team.arrived_members);
    while (aArr.length <= index) aArr.push('false');
    aArr[index] = isChecked ? 'true' : 'false';

    const { error } = await db.from('teams').update({ arrived_members: aArr.join(', ') }).eq('team', teamName);
    if (error) alert("Ошибка сохранения: " + error.message);
    loadTeams();
};

window.deleteMember = async function(teamName, index) {
    const team = teamsData.find(t => t.team === teamName);
    if (!team) return;

    let mArr = splitData(team.members);
    let tArr = splitData(team.tgs);
    let nArr = splitData(team.numbers);
    let aArr = splitData(team.arrived_members); // Удаляем и его чекбокс

    const memberName = mArr[index] || "Безымянного участника";
    if (!confirm(`Вы уверены, что хотите удалить участника: ${memberName}?`)) return; 

    mArr.splice(index, 1); tArr.splice(index, 1); nArr.splice(index, 1); aArr.splice(index, 1);

    await db.from('teams').update({ 
        members: mArr.join(', '), tgs: tArr.join(', '), numbers: nArr.join(', '), arrived_members: aArr.join(', '), team_len: mArr.length + 1
    }).eq('team', teamName);
    
    loadTeams(); 
};

window.deleteTeam = async function(teamName) {
    if (confirm(`Вы уверены, что хотите полностью удалить команду "${teamName}"?`)) {
        await db.from('teams').delete().eq('team', teamName);
        loadTeams();
    }
};

// --- ОКНО ДОБАВЛЕНИЯ ---
function createModalHTML() {
    const existingModal = document.getElementById('addMemberModal');
    if (existingModal) existingModal.remove();

    const modalHTML = `
    <div id="addMemberModal" class="modal-overlay">
        <div class="modal-content">
            <h3 class="modal-title">Новый участник</h3>
            <div class="modal-field"><label>Имя и Фамилия</label><input type="text" id="modalName" placeholder="Например: Иван Иванов"></div>
            <div class="modal-field"><label>Telegram</label><input type="text" id="modalTg" placeholder="@username"></div>
            <div class="modal-field"><label>Телефон</label><input type="text" id="modalPhone" placeholder="+7..."></div>
            <div class="modal-actions"><button class="btn-secondary" id="btnCancelAdd">Отмена</button><button class="btn-primary" id="btnSaveAdd">Сохранить</button></div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('btnCancelAdd').addEventListener('click', window.closeModal);
    document.getElementById('btnSaveAdd').addEventListener('click', window.saveNewMember);
}

window.openAddModal = function(teamName) {
    targetTeamForNewMember = teamName;
    document.getElementById('modalName').value = ''; document.getElementById('modalTg').value = ''; document.getElementById('modalPhone').value = '';
    document.getElementById('addMemberModal').style.display = 'flex';
};

window.closeModal = function() {
    targetTeamForNewMember = null;
    document.getElementById('addMemberModal').style.display = 'none';
};

window.saveNewMember = async function() {
    try {
        if (!targetTeamForNewMember) return;
        const btnSave = document.getElementById('btnSaveAdd'); btnSave.innerText = "Сохранение..."; btnSave.disabled = true;

        const team = teamsData.find(t => t.team === targetTeamForNewMember);
        if (!team) { window.closeModal(); return; }

        let mArr = splitData(team.members); let tArr = splitData(team.tgs); let nArr = splitData(team.numbers); let aArr = splitData(team.arrived_members);
        const maxLen = Math.max(mArr.length, tArr.length, nArr.length, aArr.length, 0);

        while (mArr.length < maxLen) mArr.push(''); while (tArr.length < maxLen) tArr.push(''); while (nArr.length < maxLen) nArr.push(''); while (aArr.length < maxLen) aArr.push('false');

        mArr.push(document.getElementById('modalName').value.replace(/,/g, '').trim() || 'Новый участник');
        tArr.push(document.getElementById('modalTg').value.replace(/,/g, '').trim());
        nArr.push(document.getElementById('modalPhone').value.replace(/,/g, '').trim());
        aArr.push('false'); // Новый участник по умолчанию не пришел

        const { error } = await db.from('teams').update({ 
            members: mArr.join(', '), tgs: tArr.join(', '), numbers: nArr.join(', '), arrived_members: aArr.join(', '), team_len: mArr.length + 1
        }).eq('team', targetTeamForNewMember);

        btnSave.innerText = "Сохранить"; btnSave.disabled = false;
        if (error) alert("Ошибка: " + error.message); else { window.closeModal(); loadTeams(); }
    } catch (e) { alert("Ошибка: " + e.message); }
};

// --- ЗАГРУЗКА И ОТРИСОВКА ---
async function loadTeams() {
    const { data, error } = await db.from('teams').select('*').order('team', { ascending: true });
    if (error) { console.error("Ошибка:", error); return; }
    teamsData = data;
    window.renderTeams(); 
}

window.renderTeams = function() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const filteredData = teamsData.filter(item => {
        const searchString = `${item.team || ''} ${item.leader || ''} ${item.tg || ''} ${item.number || ''} ${item.members || ''} ${item.tgs || ''} ${item.numbers || ''}`.toLowerCase();
        return searchString.includes(searchTerm);
    });

    document.getElementById('stats').innerText = searchTerm ? `Найдено: ${filteredData.length} из ${teamsData.length}` : `Всего команд: ${teamsData.length}`;
    tableBody.innerHTML = '';

    filteredData.forEach(item => {
        const row = document.createElement('tr');

        const mArr = splitData(item.members);
        const tArr = splitData(item.tgs);
        const nArr = splitData(item.numbers);
        const aArr = splitData(item.arrived_members); // Массив чекбоксов участников
        const maxLen = Math.max(mArr.length, tArr.length, nArr.length, 0);

        let arrivedCount = item.arrived_leader ? 1 : 0;
        for (let i = 0; i < maxLen; i++) {
            if (aArr[i] === 'true') arrivedCount++;
        }

        let rosterHTML = '<div class="members-list">';
        
        rosterHTML += `
            <div class="member-card leader-card">
                <div class="leader-badge">Лидер</div>
                <div class="member-name">
                    <input type="checkbox" class="arrival-checkbox" ${item.arrived_leader ? 'checked' : ''} onchange="window.updateLeaderArrival('${item.team}', this.checked)" title="Отметить присутствие">
                    👤 <span contenteditable="true" onblur="window.updateField('${item.team}', 'leader', this.innerText)" data-placeholder="Имя лидера">${item.leader || ''}</span>
                </div>
                <div class="member-contacts">
                    <span>💬 <span contenteditable="true" onblur="window.updateField('${item.team}', 'tg', this.innerText)" data-placeholder="TG">${item.tg || ''}</span></span>
                    <span>📞 <span contenteditable="true" onblur="window.updateField('${item.team}', 'number', this.innerText)" data-placeholder="Телефон">${item.number || ''}</span></span>
                    <span>📧 <span contenteditable="true" onblur="window.updateField('${item.team}', 'email', this.innerText)" data-placeholder="Email">${item.email || ''}</span></span>
                </div>
            </div>`;

        for (let i = 0; i < maxLen; i++) {
            const isArrived = aArr[i] === 'true';
            rosterHTML += `
                <div class="member-card">
                    <button class="btn-remove-member" onclick="window.deleteMember('${item.team}', ${i})" title="Удалить участника">✖</button>
                    <div class="member-name">
                        <input type="checkbox" class="arrival-checkbox" ${isArrived ? 'checked' : ''} onchange="window.updateMemberArrival('${item.team}', ${i}, this.checked)" title="Отметить присутствие">
                        👤 <span contenteditable="true" onblur="window.updateArrayField('${item.team}', 'members', ${i}, this.innerText)" data-placeholder="Имя">${mArr[i] || ''}</span>
                    </div>
                    <div class="member-contacts">
                        <span>💬 <span contenteditable="true" onblur="window.updateArrayField('${item.team}', 'tgs', ${i}, this.innerText)" data-placeholder="TG">${tArr[i] || ''}</span></span>
                        <span>📞 <span contenteditable="true" onblur="window.updateArrayField('${item.team}', 'numbers', ${i}, this.innerText)" data-placeholder="Телефон">${nArr[i] || ''}</span></span>
                    </div>
                </div>`;
        }

        rosterHTML += `
            <div class="member-card btn-add-member-card" onclick="window.openAddModal('${item.team}')">
                <span>➕ Добавить</span>
            </div></div>`;

        row.innerHTML = `
            <td style="vertical-align: top;">
                <div class="team-design-card">
                    <div contenteditable="true" onblur="window.updateField('${item.team}', 'team', this.innerText)" class="team-name-big" data-placeholder="Название">${item.team}</div>
                    
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                        <div class="team-size-wrap">
                            Всего: <span class="team-size-number">${item.team_len || 0}</span>
                        </div>
                        <div class="team-size-wrap">
                            Пришли: <span class="team-arrived-badge">${arrivedCount}</span>
                        </div>
                    </div>

                    <button class="btn-delete-compact" onclick="window.deleteTeam('${item.team}')">Удалить команду</button>
                </div>
            </td>
            <td>${rosterHTML}</td>
        `;
        tableBody.appendChild(row);
    });
}

init();
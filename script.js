const SUPABASE_URL = 'https://lleveuxsfkjzpoxwlhqb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsZXZldXhzZmtqenBveHdsaHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQzNDEsImV4cCI6MjA5MTE5MDM0MX0.FjW9SWaPgRJfqgnzD3HIFtz3ea-pmnFMdbh_vq5jmyQ';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginScreen = document.getElementById('login-screen');
const mainContent = document.getElementById('main-content');
const loginForm = document.getElementById('loginForm');
const teamForm = document.getElementById('teamForm');
const tableBody = document.getElementById('teamsTableBody');

async function checkUser() {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
        showApp();
    } else {
        showLogin();
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('emailAuth').value;
    const password = document.getElementById('passwordAuth').value;

    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        alert("Ошибка входа: " + error.message);
    } else {
        showApp();
    }
});

document.getElementById('logoutBtn').onclick = async () => {
    await db.auth.signOut();
    showLogin();
};

function showApp() {
    loginScreen.style.display = 'none';
    mainContent.style.display = 'block';
    loadTeams();
}

function showLogin() {
    loginScreen.style.display = 'block';
    mainContent.style.display = 'none';
}

async function loadTeams() {
    const { data, error } = await db.from('teams').select('*').order('id', { ascending: false });
    if (error) {
        console.error(error);
        return;
    }

    tableBody.innerHTML = '';
    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${item.teams}</strong></td>
            <td>${item.leader}</td>
            <td class="contact-info">TG: ${item.tg || '-'}<br>Tel: ${item.number || '-'}</td>
            <td><button class="delete-btn" onclick="deleteTeam(${item.id})">Удалить</button></td>
        `;
        tableBody.appendChild(row);
    });
}

teamForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('addBtn');
    submitBtn.disabled = true;

    const newTeam = {
        teams: document.getElementById('teams').value,
        team_len: parseInt(document.getElementById('team_len').value),
        leader: document.getElementById('leader').value,
        tg: document.getElementById('tg').value,
        email: document.getElementById('email').value,
        number: document.getElementById('number').value,
        members: document.getElementById('members').value,
        tgs: document.getElementById('tgs').value,
        numbers: document.getElementById('numbers').value,
    };

    const { error } = await db.from('teams').insert([newTeam]);
    if (error) {
        alert(error.message);
    } else { 
        teamForm.reset(); 
        loadTeams(); 
    }
    submitBtn.disabled = false;
});

async function deleteTeam(id) {
    if (confirm("Удалить эту команду?")) {
        await db.from('teams').delete().eq('id', id);
        loadTeams();
    }
}

checkUser();
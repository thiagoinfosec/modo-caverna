const DB = {
            key: 'caverna_os_v7',
            state: {
                banks: [],
                transactions: [],
                tasks: [],
                habits: [],
                library: [],
                fixed: [],
                incomes: [],
                lastWeek: null,
                lastCongratulatedDate: null // <--- ADICIONE ESTA LINHA
            },
            init() {
                const saved = localStorage.getItem(this.key);
                if (saved) {
                    this.state = JSON.parse(saved);
                    if (!this.state.incomes) this.state.incomes = [];
                }

                // --- LÓGICA DE VIRADA DE MÊS DIRETO NA CONTA ---
                const today = new Date();
                const offset = today.getTimezoneOffset() * 60000;
                const currentMonthStr = new Date(today.getTime() - offset).toISOString().slice(0, 7); // Ex: "2026-03"

                let updated = false;

                // Atualiza Gastos Fixos que ficaram no passado
                if (this.state.fixed) {
                    this.state.fixed.forEach(f => {
                        if (f.date) {
                            const itemMonth = f.date.slice(0, 7); // Pega só o "YYYY-MM" da conta
                            // Se o mês da conta for menor que o mês atual, vira o mês dela
                            if (itemMonth < currentMonthStr) {
                                f.paid = false;
                                const dia = f.date.split('-')[2]; // Mantém o dia original
                                f.date = `${currentMonthStr}-${dia}`; // Atualiza pro mês atual
                                updated = true;
                            }
                        }
                    });
                }

                // Atualiza Receitas Fixas que ficaram no passado
                if (this.state.incomes) {
                    this.state.incomes.forEach(inc => {
                        if (inc.date) {
                            const itemMonth = inc.date.slice(0, 7);
                            if (itemMonth < currentMonthStr) {
                                inc.received = false;
                                const dia = inc.date.split('-')[2];
                                inc.date = `${currentMonthStr}-${dia}`;
                                updated = true;
                            }
                        }
                    });
                }

                // Se alterou algo, salva silenciosamente
                if (updated) {
                    localStorage.setItem(this.key, JSON.stringify(this.state));
                }
            },
            save() {
                localStorage.setItem(this.key, JSON.stringify(this.state));
                System.refreshAll();
            }
        };

        // --- 2. SYSTEM CONTROLLER (CORRIGIDO: INICIALIZAÇÃO) ---
        const System = {
            init() {
                DB.init();
                this.updateGreeting();
                FinanceModule.init();

                // 1. Remove 'hidden' imediatamente para o layout ocupar espaço
                const dash = document.getElementById('dashboard');
                if (dash) dash.classList.remove('hidden');

                // 2. Renderiza HTML
                this.refreshAll();

                // 3. Tenta desenhar os gráficos em dois momentos para garantir
                // Momento A: Rápido (para PC rápido)
                setTimeout(() => {
                    if (typeof ChartsModule !== 'undefined') ChartsModule.renderAll();
                }, 100);

                // Momento B: Segurança (para celular/carregamento lento)
                setTimeout(() => {
                    if (typeof ChartsModule !== 'undefined') {
                        Object.values(ChartsModule.instances).forEach(c => c && c.resize());
                        ChartsModule.renderAll();
                    }
                }, 500);

                if (typeof HabitModule !== 'undefined') HabitModule.checkWeeklyReset();
                StreakModule.updateUI();
            },

            updateGreeting() {
                const h = new Date().getHours();
                const el = document.getElementById('greeting-text');

                if (el) {
                    let saudacao = '';

                    // Lógica da Madrugada (00h até 05h)
                    if (h >= 0 && h < 5) {
                        saudacao = 'Vai dormir';
                    }
                    // Manhã (05h até 12h)
                    else if (h >= 5 && h < 12) {
                        saudacao = 'Bom dia';
                    }
                    // Tarde (12h até 18h)
                    else if (h >= 12 && h < 18) {
                        saudacao = 'Boa tarde';
                    }
                    // Noite (18h até 23h59)
                    else {
                        saudacao = 'Boa noite';
                    }

                    el.innerText = `${saudacao}, Engenheiro.`;
                }
            },

            navigate(viewId) {
                // 1. Esconde todas as telas
                document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

                // 2. Mostra a tela desejada
                const target = document.getElementById(viewId);
                if (target) target.classList.remove('hidden');

                // --- O PULO DO GATO ESTÁ AQUI ---
                // Força a rolagem voltar para o topo
                const scrollContainer = document.querySelector('.main-content');
                if (scrollContainer) {
                    scrollContainer.scrollTop = 0;
                }
                // -------------------------------

                // 3. ATUALIZA BOTOES
                document.querySelectorAll('.nav-btn, .mob-link').forEach(el => el.classList.remove('active'));

                const buttonsToActivate = document.querySelectorAll(`[onclick*="'${viewId}'"]`);

                buttonsToActivate.forEach(btn => {
                    btn.classList.add('active');
                });

                // 4. Redesenha gráficos se necessário
                if (viewId === 'dashboard' || viewId === 'financeiro') {
                    setTimeout(() => {
                        if (typeof ChartsModule !== 'undefined') {
                            Object.values(ChartsModule.instances).forEach(c => c && c.resize());
                            ChartsModule.renderAll();
                        }
                    }, 100);
                }
            },

            refreshAll() {
                FinanceModule.render();
                if (typeof FixedExpensesModule !== 'undefined') FixedExpensesModule.render();
                if (typeof FixedIncomeModule !== 'undefined') FixedIncomeModule.render();
                TaskModule.render();
                HabitModule.render();
                LibraryModule.render();
                this.updateDashboardKPIs();

                // FORÇA A ATUALIZAÇÃO DA OFENSIVA EM QUALQUER REFRESH
                if (typeof StreakModule !== 'undefined') StreakModule.updateUI();
            },

            updateDashboardKPIs() {
                const totalEquity = DB.state.banks.reduce((acc, b) => acc + b.balance, 0);
                const elEquity = document.getElementById('dash-total-equity');
                if (elEquity) elEquity.innerText = totalEquity.toFixed(2);

                // Usa a função inteligente de fuso horário que já temos
                const today = typeof getLocalTodayString === 'function' ? getLocalTodayString() : new Date().toISOString().split('T')[0];

                let pending = 0, paraHoje = 0, concluidas = 0, atrasadas = 0;

                DB.state.tasks.forEach(t => {
                    if (t.done) {
                        concluidas++;
                    } else {
                        pending++; // Tudo que não está feito, está pendente

                        if (t.date === today) {
                            paraHoje++;
                        } else if (t.date && t.date < today) {
                            atrasadas++;
                        }
                    }
                });

                const elPending = document.getElementById('dash-pending-tasks');
                if (elPending) elPending.innerText = pending;

                const elToday = document.getElementById('dash-today-tasks');
                if (elToday) elToday.innerText = paraHoje;

                const elDone = document.getElementById('dash-done-tasks');
                if (elDone) elDone.innerText = concluidas;

                const elMissed = document.getElementById('dash-missed-tasks');
                if (elMissed) elMissed.innerText = atrasadas;
            },

            closeCongratsModal() {
                document.getElementById('congrats-modal').classList.remove('active');
            },

            showCongratsModal(title, text) {
                const oldModal = document.getElementById('congrats-overlay');
                if (oldModal) oldModal.remove();

                const modal = document.createElement('div');
                modal.id = 'congrats-overlay';
                // CSS embutido e travado para não sofrer interferência de nada
                modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 9999999; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; visibility: hidden; pointer-events: none; transition: all 0.4s ease;";

                modal.innerHTML = `
                <div id="congrats-content" style="
                    background: #141416; border: 2px solid #10b981; border-radius: 24px;
                    width: 90%; max-width: 400px; padding: 30px 20px; text-align: center;
                    transform: translateY(40px) scale(0.9); opacity: 0; transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: 0 20px 50px rgba(16, 185, 129, 0.2); pointer-events: auto;
                ">
                    <div style="font-size: 80px; color: #10b981; margin-bottom: 15px;">
                        <i class="fas fa-trophy"></i>
                    </div>
                    <h1 style="font-family: 'Inter', sans-serif; font-size: 2.2rem; font-weight: 900; color: #fff; margin-bottom: 10px; line-height: 1.1; text-transform: uppercase;">
                        ${title}
                    </h1>
                    <p style="color: #8b8d98; font-size: 1rem; margin-bottom: 30px; line-height: 1.5;">
                        ${text}
                    </p>
                    <button style="width: 100%; background: #10b981; color: #000; border: none; padding: 18px; border-radius: 12px; font-weight: 900; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 15px rgba(16,185,129,0.4);" 
                        onclick="document.getElementById('congrats-overlay').remove()">
                        CONTINUAR FOCO
                    </button>
                </div>
            `;

                document.body.appendChild(modal);

                setTimeout(() => {
                    modal.style.opacity = '1';
                    modal.style.visibility = 'visible';
                    modal.style.pointerEvents = 'auto';

                    const content = document.getElementById('congrats-content');
                    if (content) {
                        content.style.transform = 'translateY(0) scale(1)';
                        content.style.opacity = '1';
                    }
                }, 50);
            },

            checkDailyGoal() {
                try {
                    const todayObj = new Date();
                    todayObj.setHours(0, 0, 0, 0);
                    const todayStr = getLocalTodayString(todayObj);
                    const todayDayOfWeek = todayObj.getDay();
                    const currentMonthStr = todayStr.slice(0, 7);

                    // 1. VERIFICA TAREFAS (SOMENTE EXATAMENTE DE HOJE)
                    let pendingTasks = 0;
                    let activeTasksCount = 0;

                    DB.state.tasks.forEach(t => {
                        if (t.date === todayStr) {
                            activeTasksCount++;
                            if (!t.done) pendingTasks++;
                        }
                    });

                    // 2. VERIFICA HÁBITOS DE HOJE
                    let pendingHabits = 0;
                    let activeHabitsCount = 0;

                    const dataBaseA = new Date(2026, 1, 21); dataBaseA.setHours(0, 0, 0, 0);
                    const diasPassados = Math.round((todayObj.getTime() - dataBaseA.getTime()) / 86400000);
                    const semanasPassadas = Math.floor(diasPassados / 7);
                    const isFdsA_Ativo = (Math.abs(semanasPassadas % 2) === 0);

                    DB.state.habits.forEach(h => {
                        if (h.completed) return; // Ignora se o hábito em si foi arquivado

                        const hFreq = h.freq || 'Diário';

                        let activeDays = (h.activeDays && Array.isArray(h.activeDays)) ? h.activeDays.map(Number) : [];
                        if (activeDays.length === 0) {
                            if (hFreq === 'Dias Úteis') activeDays = [1, 2, 3, 4, 5];
                            else if (['Semanal', 'FDS A', 'FDS B'].includes(hFreq)) activeDays = [0, 6];
                            else activeDays = [0, 1, 2, 3, 4, 5, 6];
                        }

                        let ehPraHoje = false;
                        let jaFezPeriodo = false;
                        const checks = h.checks || {};

                        // Lógica para saber se o Hábito cai no dia de HOJE
                        if (hFreq === 'Mensal') {
                            jaFezPeriodo = Object.keys(checks).some(d => d.startsWith(currentMonthStr));
                            ehPraHoje = !jaFezPeriodo || !!checks[todayStr];
                        } else if (hFreq === 'Quinzenal') {
                            for (let j = 0; j <= 15; j++) {
                                const temp = new Date(todayObj);
                                temp.setDate(temp.getDate() - j);
                                if (checks[getLocalTodayString(temp)]) { jaFezPeriodo = true; break; }
                            }
                            ehPraHoje = !jaFezPeriodo || !!checks[todayStr];
                        } else if (hFreq === 'FDS A') {
                            ehPraHoje = isFdsA_Ativo && activeDays.includes(todayDayOfWeek);
                        } else if (hFreq === 'FDS B') {
                            ehPraHoje = !isFdsA_Ativo && activeDays.includes(todayDayOfWeek);
                        } else {
                            ehPraHoje = activeDays.includes(todayDayOfWeek);
                        }

                        // Se a data de criação for MAIOR que hoje, não é pra hoje
                        if (h.createdAt) {
                            const cp = h.createdAt.split('-');
                            if (cp.length === 3) {
                                const habitStartDate = new Date(cp[0], cp[1] - 1, cp[2]);
                                habitStartDate.setHours(0, 0, 0, 0);
                                if (todayObj < habitStartDate) ehPraHoje = false;
                            }
                        }

                        // Se o hábito for para hoje, checa se foi feito
                        if (ehPraHoje) {
                            activeHabitsCount++;
                            if (!checks[todayStr]) {
                                pendingHabits++;
                            }
                        }
                    });

                    const totalItemsToComplete = activeTasksCount + activeHabitsCount;
                    const totalPendingNow = pendingTasks + pendingHabits;

                    // 3. DISPARA O POP-UP DE 100% DO DIA
                    if (totalItemsToComplete > 0 && totalPendingNow === 0) {
                        if (DB.state.lastCongratulatedDate !== todayStr) {
                            // Grava que hoje já foi parabenizado para não abrir de novo
                            DB.state.lastCongratulatedDate = todayStr;
                            localStorage.setItem(DB.key, JSON.stringify(DB.state));

                            setTimeout(() => {
                                System.showCongratsModal(
                                    "MISSÃO CUMPRIDA!",
                                    "Você dominou <strong>100%</strong> das tarefas e hábitos de hoje. O Modo Caverna está orgulhoso."
                                );
                            }, 300);
                        }
                    } else if (totalPendingNow > 0) {
                        // Se desmarcou algo e voltou a ficar pendente, reseta o parabenizado do dia
                        if (DB.state.lastCongratulatedDate === todayStr) {
                            DB.state.lastCongratulatedDate = null;
                            localStorage.setItem(DB.key, JSON.stringify(DB.state));
                        }
                    }
                } catch (err) {
                    console.error("Erro no checkDailyGoal:", err);
                }
            },

            backup() {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(DB.state));
                const downloadAnchorNode = document.createElement('a');
                const date = new Date().toISOString().slice(0, 10);
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", `backup_modo_caverna_${date}.json`);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
            },

            restore(input) {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function (e) {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (data.banks && data.tasks) {
                            if (confirm("Restaurar backup?")) {
                                DB.state = data;
                                if (!DB.state.fixed) DB.state.fixed = [];
                                if (!DB.state.incomes) DB.state.incomes = [];
                                DB.save();
                                alert("Sucesso!");
                                location.reload();
                            }
                        } else { alert("Arquivo inválido."); }
                    } catch (err) { alert("Erro ao ler arquivo."); }
                };
                reader.readAsText(file);
            }
        };

        // --- MÓDULO EXCLUSIVO DO DASHBOARD (POP-UPS DE TAREFA) ---
        const DashboardModule = {
            showTasks(type) {
                const today = getLocalTodayString();
                let filtered = [];
                let title = "";
                let color = "";
                let icon = "";

                // Filtra as tarefas dependendo do quadrado clicado
                if (type === 'pending') {
                    filtered = DB.state.tasks.filter(t => !t.done);
                    title = "Todas Pendentes"; color = "#fff"; icon = "fa-hourglass-half";
                } else if (type === 'today') {
                    filtered = DB.state.tasks.filter(t => !t.done && t.date === today);
                    title = "Para Hoje"; color = "#3b82f6"; icon = "fa-calendar-day";
                } else if (type === 'done') {
                    filtered = DB.state.tasks.filter(t => t.done);
                    title = "Concluídas"; color = "var(--color-success)"; icon = "fa-check-circle";
                } else if (type === 'missed') {
                    filtered = DB.state.tasks.filter(t => !t.done && t.date && t.date < today);
                    title = "Atrasadas"; color = "var(--color-danger)"; icon = "fa-exclamation-circle";
                }

                const modalTitle = document.getElementById('prod-modal-title');
                modalTitle.innerHTML = `<i class="fas ${icon}"></i> ${title}`;
                modalTitle.style.color = color;

                const modalBody = document.getElementById('prod-modal-body');
                modalBody.innerHTML = '';

                // Injeta as tarefas na lista
                if (filtered.length === 0) {
                    modalBody.innerHTML = '<div style="color:#888; text-align:center; padding: 20px; font-size: 0.9rem;">Nenhuma tarefa encontrada.</div>';
                } else {
                    // NOVA ORDENAÇÃO: 1º Prioridade, 2º Data, 3º Horário
                    filtered.sort((a, b) => {
                        // 1. Avalia a Prioridade (Alta = 3, Média = 2, Baixa = 1)
                        const pWeight = { 'HIGH': 3, 'MED': 2, 'LOW': 1 };
                        const wA = pWeight[a.prio] || 0;
                        const wB = pWeight[b.prio] || 0;

                        if (wA !== wB) {
                            return wB - wA; // Prioridades maiores ficam no topo
                        }

                        // 2. Se a prioridade for igual, avalia a Data
                        if (a.date !== b.date) {
                            if (!a.date) return 1;  // Sem data vai para o final
                            if (!b.date) return -1;
                            return a.date.localeCompare(b.date); // Mais antigas/próximas primeiro
                        }

                        // 3. Se prioridade e data forem iguais, avalia o Horário
                        return (a.time || '').localeCompare(b.time || '');
                    });

                    filtered.forEach(t => {
                        // Formata a data e adiciona o horário (se existir) para visualização
                        let dateStr = t.date ? t.date.split('-').reverse().join('/') : 'Sem data';
                        if (t.time) dateStr += ` - ${t.time}`;

                        // Mapeia a prioridade para o texto e classe CSS corretos
                        let prioClass = t.prio === 'HIGH' ? 'p-high' : (t.prio === 'MED' ? 'p-med' : 'p-low');
                        let prioText = t.prio === 'HIGH' ? 'Alta' : (t.prio === 'MED' ? 'Média' : 'Baixa');

                        modalBody.innerHTML += `
                        <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${color};">
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                <span style="font-weight: 500; font-size: 0.9rem; word-break: break-word; line-height: 1.3;">${t.desc}</span>
                                <div>
                                    <span class="priority-badge mono ${prioClass}" style="font-size: 0.6rem; padding: 2px 6px;">${prioText}</span>
                                </div>
                            </div>
                            <span style="font-size: 0.7rem; color: #888; flex-shrink: 0; margin-left: 10px; text-align: right;" class="mono">${dateStr}</span>
                        </div>
                    `;
                    });
                }

                // Exibe o modal na tela
                document.getElementById('productivity-modal').classList.add('active');
            },

            closeModal(e) {
                if (e) e.stopPropagation();
                document.getElementById('productivity-modal').classList.remove('active');
            }
        };

        // --- 3. FINANCE MODULE (ATUALIZADO: SCROLL CORRETO + ÍCONES PADRONIZADOS) ---
        const FinanceModule = {
            editingTransId: null,

            init() {
                // Usa a função local em vez de toISOString()
                const today = getLocalTodayString();
                const inputs = ['trans-date', 'task-date', 'fixed-date', 'inc-date'];
                inputs.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = today;
                });

                // NOVO: Preenche o select de Fluxo de Caixa com os meses disponíveis
                const flowMonthEl = document.getElementById('flow-month-filter');
                if (flowMonthEl) {
                    const currentMonth = getLocalTodayString().slice(0, 7); // Ex: "2026-03"
                    const monthsSet = new Set();

                    // --- FORÇA OS MESES DESDE JAN/2026 ATÉ O MÊS ATUAL ---
                    const [anoAtual, mesAtual] = currentMonth.split('-').map(Number);
                    for (let ano = 2026; ano <= anoAtual; ano++) {
                        // Se for o ano atual, vai só até o mês atual. Se for ano passado, vai até 12.
                        const limiteMes = (ano === anoAtual) ? mesAtual : 12;
                        for (let mes = 1; mes <= limiteMes; mes++) {
                            monthsSet.add(`${ano}-${String(mes).padStart(2, '0')}`);
                        }
                    }

                    // Busca todos os meses que têm alguma transação registrada

                    // Busca todos os meses que têm alguma transação registrada
                    DB.state.transactions.forEach(t => {
                        if (t.date) {
                            const parts = t.date.split('/'); // DD/MM/YYYY
                            if (parts.length === 3) {
                                monthsSet.add(`${parts[2]}-${parts[1]}`); // Salva como YYYY-MM
                            }
                        }
                    });

                    // Ordena do mês mais novo para o mais antigo
                    const sortedMonths = Array.from(monthsSet).sort().reverse();

                    // Cria as <option> dentro do select
                    flowMonthEl.innerHTML = '';
                    sortedMonths.forEach(m => {
                        const [year, month] = m.split('-');
                        const opt = document.createElement('option');
                        opt.value = m;
                        opt.innerText = `${month}/${year}`; // Mostra formatado pro usuário (MM/YYYY)
                        if (m === currentMonth) opt.selected = true; // Deixa o mês atual selecionado
                        flowMonthEl.appendChild(opt);
                    });
                }
            },

            getCategoryIcon(cat) {
                const map = {
                    'Alimentação': 'fa-utensils',
                    'Transporte': 'fa-car',
                    'Moradia': 'fa-home',
                    'Educação': 'fa-graduation-cap',
                    'Lazer/Assinaturas': 'fa-film',
                    'Saúde/Cuidados': 'fa-heartbeat',
                    'Compras': 'fa-shopping-bag',
                    'Investimento': 'fa-chart-line',
                    'Salário': 'fa-briefcase',
                    'Outros': 'fa-box'
                };
                return map[cat] || 'fa-circle';
            },

            addAccount() {
                const name = document.getElementById('bank-select').value;
                const bal = parseFloat(document.getElementById('bank-balance-init').value);
                if (name && !isNaN(bal)) {
                    if (DB.state.banks.some(b => b.name === name)) return alert(`Conta já existe!`);
                    DB.state.banks.push({ id: Date.now(), name, balance: bal });
                    document.getElementById('bank-balance-init').value = '';
                    UI.toggle('bank-add-form');
                    DB.save();
                }
            },

            deleteAccount(id) {
                if (confirm("Apagar conta?")) {
                    DB.state.banks = DB.state.banks.filter(b => b.id !== id);
                    DB.save();
                }
            },

            editAccount(id) {
                const bank = DB.state.banks.find(b => b.id === id);
                if (bank) {
                    const novo = prompt("Novo saldo:", bank.balance);
                    if (novo && !isNaN(novo)) {
                        bank.balance = parseFloat(novo);
                        DB.save();
                    }
                }
            },

            addTransaction(type) {
                const desc = document.getElementById('trans-desc').value;
                const val = parseFloat(document.getElementById('trans-val').value);
                const accId = parseInt(document.getElementById('trans-account-select').value);
                const dateVal = document.getElementById('trans-date').value;
                const cat = document.getElementById('trans-cat').value || 'Outros';
                const paymentMethod = document.getElementById('trans-payment-method') ? document.getElementById('trans-payment-method').value : 'Pix';

                if (!desc || isNaN(val) || !accId || !dateVal) {
                    return alert("Preencha todos os campos!");
                }

                const bank = DB.state.banks.find(b => b.id === accId);
                if (!bank) return alert("Conta não encontrada.");

                if (this.editingTransId) {
                    // MODO EDIÇÃO
                    const transIndex = DB.state.transactions.findIndex(t => t.id === this.editingTransId);
                    if (transIndex > -1) {
                        const oldTrans = DB.state.transactions[transIndex];

                        // 1. Estorna saldo antigo
                        const oldBank = DB.state.banks.find(b => b.name === oldTrans.accName);
                        if (oldBank) {
                            if (oldTrans.type === 'income') oldBank.balance -= oldTrans.val;
                            else oldBank.balance += oldTrans.val;
                        }

                        // 2. Aplica novo saldo
                        if (type === 'income') bank.balance += val;
                        else bank.balance -= val;

                        // 3. Atualiza dados
                        const [ano, mes, dia] = dateVal.split('-');
                        DB.state.transactions[transIndex] = {
                            ...oldTrans,
                            date: `${dia}/${mes}/${ano}`,
                            desc, val, type, cat,
                            paymentMethod,
                            accName: bank.name
                        };

                        this.cancelEditTransaction();
                    }
                } else {
                    // MODO ADIÇÃO
                    if (type === 'income') bank.balance += val;
                    else bank.balance -= val;

                    const [ano, mes, dia] = dateVal.split('-');
                    DB.state.transactions.unshift({
                        id: Date.now(),
                        date: `${dia}/${mes}/${ano}`,
                        desc, val, type, cat,
                        paymentMethod,
                        accName: bank.name
                    });

                    document.getElementById('trans-desc').value = '';
                    document.getElementById('trans-val').value = '';
                }

                DB.save();
            },

            // Entrar no modo de edição (Scroll Ajustado para o Topo)
            // Entrar no modo de edição (Scroll Ajustado Manualmente)
            editTransaction(id) {
                const trans = DB.state.transactions.find(t => t.id === id);
                if (!trans) return;

                this.editingTransId = id;

                // Preenche campos
                document.getElementById('trans-desc').value = trans.desc;
                document.getElementById('trans-val').value = trans.val;

                // Data
                const parts = trans.date.split('/');
                document.getElementById('trans-date').value = `${parts[2]}-${parts[1]}-${parts[0]}`;

                // Categoria
                const catSelect = document.getElementById('trans-cat');
                catSelect.value = trans.cat || 'Outros';

                // Forma de Pagamento
                const pmSelect = document.getElementById('trans-payment-method');
                if (pmSelect) pmSelect.value = trans.paymentMethod || 'Pix';

                // Conta
                const bank = DB.state.banks.find(b => b.name === trans.accName);
                if (bank) document.getElementById('trans-account-select').value = bank.id;

                // UI
                document.getElementById('btn-cancel-trans-edit').style.display = 'block';
                document.getElementById('btn-income').innerText = 'Atualizar (Entrada)';
                document.getElementById('btn-expense').innerText = 'Atualizar (Saída)';

                // --- AJUSTE DE ROLAGEM (SCROLL) ---
                const container = document.querySelector('.main-content');
                const cardOperacoes = document.getElementById('card-operacoes');

                if (cardOperacoes) {
                    setTimeout(() => {
                        const elementRect = cardOperacoes.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        const currentScroll = container.scrollTop;

                        // OFFSET: Define o espaço de respiro no topo.
                        // 70px faz a tela subir um pouco, deixando o card visível com uma margem acima.
                        const offset = 70;

                        const targetPosition = currentScroll + (elementRect.top - containerRect.top) - offset;

                        container.scrollTo({
                            top: targetPosition,
                            behavior: 'smooth'
                        });
                    }, 50);
                }
            },

            cancelEditTransaction() {
                this.editingTransId = null;
                document.getElementById('trans-desc').value = '';
                document.getElementById('trans-val').value = '';
                const pmSelect = document.getElementById('trans-payment-method');
                if (pmSelect) pmSelect.value = 'Pix';
                document.getElementById('btn-cancel-trans-edit').style.display = 'none';
                document.getElementById('btn-income').innerHTML = '<i class="fas fa-arrow-up"></i> Entrada';
                document.getElementById('btn-expense').innerHTML = '<i class="fas fa-arrow-down"></i> Saída';
            },

            deleteTransaction(id) {
                const trans = DB.state.transactions.find(t => t.id === id);
                if (trans && confirm("Excluir transação? O saldo será revertido.")) {
                    const bank = DB.state.banks.find(b => b.name === trans.accName);
                    if (bank) {
                        if (trans.type === 'income') bank.balance -= trans.val;
                        else bank.balance += trans.val;
                    }
                    DB.state.transactions = DB.state.transactions.filter(t => t.id !== id);

                    if (this.editingTransId === id) this.cancelEditTransaction();

                    DB.save();
                }
            },

            render() {
                const list = document.getElementById('bank-list-container');
                const select = document.getElementById('trans-account-select');

                if (!list || !select) return;

                // --- Renderiza Contas ---
                list.innerHTML = '';
                const currentSelectedAcc = select.value;
                select.innerHTML = '<option value="" disabled>Selecione a Conta</option>';
                if (DB.state.banks.length === 0) list.innerHTML = '<p style="color:#666; text-align:center;">Nenhuma conta.</p>';

                let btgId = null;

                DB.state.banks.forEach(b => {
                    let brandClass = '';
                    const n = b.name.toLowerCase();
                    if (n.includes('itaú') || n.includes('itau')) brandClass = 'bank-itau';
                    else if (n.includes('btg')) { brandClass = 'bank-btg'; btgId = b.id; }
                    else if (n.includes('caixa')) brandClass = 'bank-caixa';

                    list.innerHTML += `
                    <div class="bank-card ${brandClass}">
                        <div class="bank-info"><h4 class="mono">${b.name}</h4><div class="bank-balance">R$ ${b.balance.toFixed(2)}</div></div>
                        <div style="display:flex; gap:10px;">
                            <i class="fas fa-edit" onclick="FinanceModule.editAccount(${b.id})" style="cursor:pointer; color:#666;"></i>
                            <i class="fas fa-trash" onclick="FinanceModule.deleteAccount(${b.id})" style="cursor:pointer; color:#666;"></i>
                        </div>
                    </div>`;
                    const opt = document.createElement('option');
                    opt.value = b.id; opt.innerText = b.name; select.appendChild(opt);
                });
                if (currentSelectedAcc) select.value = currentSelectedAcc;
                else if (btgId) select.value = btgId;

                // --- RENDERIZAÇÃO DO HISTÓRICO ---
                const log = document.getElementById('transaction-log');

                // Pega filtros
                const typeFilterEl = document.getElementById('filter-type');
                const catFilterEl = document.getElementById('filter-cat');
                const monthFilterEl = document.getElementById('filter-month'); // Certifique-se de pegar o elemento aqui!

                const typeVal = typeFilterEl ? typeFilterEl.value : 'all';
                const catVal = catFilterEl ? catFilterEl.value : 'all';

                // 2. GERENCIAMENTO DO FILTRO DE MÊS DINÂMICO
                const currentMonthStr = getLocalTodayString().slice(0, 7);
                const monthsSet = new Set();

                // --- FORÇA OS MESES DESDE JAN/2026 ATÉ O MÊS ATUAL ---
                const [anoAtualRender, mesAtualRender] = currentMonthStr.split('-').map(Number);
                for (let ano = 2026; ano <= anoAtualRender; ano++) {
                    // Mesma lógica: trava no mês atual se for o ano corrente
                    const limiteMes = (ano === anoAtualRender) ? mesAtualRender : 12;
                    for (let mes = 1; mes <= limiteMes; mes++) {
                        monthsSet.add(`${ano}-${String(mes).padStart(2, '0')}`);
                    }
                }

                DB.state.transactions.forEach(t => {
                    if (t.date) {
                        const parts = t.date.split('/');
                        if (parts.length === 3) {
                            monthsSet.add(`${parts[2]}-${parts[1]}`);
                        }
                    }
                });

                const sortedMonths = Array.from(monthsSet).sort().reverse();

                // Popula o select de meses SE ele existir
                if (monthFilterEl) {
                    // Guarda o valor selecionado ANTES de repopular para não perder a seleção
                    const selectedMonth = monthFilterEl.value || currentMonthStr;

                    // Só repopula se a quantidade de opções for diferente (evita piscar)
                    if (monthFilterEl.options.length !== sortedMonths.length + 1) {
                        monthFilterEl.innerHTML = '<option value="all">Mês: Todos</option>';
                        sortedMonths.forEach(m => {
                            const [year, month] = m.split('-');
                            const opt = document.createElement('option');
                            opt.value = m;
                            opt.innerText = `${month}/${year}`;
                            if (m === selectedMonth && selectedMonth !== 'all') opt.selected = true;
                            monthFilterEl.appendChild(opt);
                        });
                        if (selectedMonth === 'all') monthFilterEl.value = 'all';
                    }
                }

                // Define o mês alvo para o filtro (usa 'all' se estiver selecionado)
                const targetMonthToFilter = monthFilterEl ? monthFilterEl.value : currentMonthStr;
                // ---------------------------------

                if (log) {
                    log.innerHTML = '';

                    // 1. Ordenar
                    const sortedTransactions = [...DB.state.transactions].sort((a, b) => {
                        const dateA = a.date.split('/').reverse().join('-');
                        const dateB = b.date.split('/').reverse().join('-');
                        if (dateA > dateB) return -1;
                        if (dateA < dateB) return 1;
                        return b.id - a.id;
                    });

                    // 2. Filtrar
                    const filteredTransactions = sortedTransactions.filter(t => {
                        const category = t.cat || 'Outros';
                        const transMonth = t.date.split('/').reverse().slice(0, 2).join('-');

                        const matchMonth = (targetMonthToFilter === 'all') || (transMonth === targetMonthToFilter);
                        const matchType = (typeVal === 'all') || (t.type === typeVal);
                        const matchCat = (catVal === 'all') || (category === catVal);

                        return matchMonth && matchType && matchCat;
                    });

                    // 3. Renderizar
                    filteredTransactions.slice(0, 30).forEach(t => {
                        const isIncome = t.type === 'income';
                        const colorCode = isIncome ? 'var(--color-success)' : 'var(--color-danger)';
                        const sign = isIncome ? '+' : '-';
                        const category = t.cat || 'Outros';
                        const iconClass = this.getCategoryIcon(category);

                        // TRATAMENTO DO NOME DO BANCO (Remove ' Banking' do nome)
                        const displayBank = t.accName ? t.accName.replace(' Banking', '') : 'Conta';

                        log.innerHTML += `
                        <div class="habit-card-mini fade-in mobile-expandable" style="
                            border-left: 4px solid ${colorCode}; 
                            padding: 12px 15px; 
                            margin-bottom: 10px; 
                            background: rgba(255,255,255,0.02);
                            border-radius: 8px;
                            display: flex; 
                            justify-content: space-between; 
                            align-items: center;">
                            
                            <div style="display: flex; align-items: flex-start; flex: 1; min-width: 0;">
                                <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; margin-right: 12px; margin-top: 2px; flex-shrink: 0;">
                                    <i class="fas ${iconClass}" style="color: #888; font-size: 0.9rem;"></i>
                                </div>

                                <div style="min-width: 0; padding-right: 10px;">
                                    <span style="display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 2px; line-height: 1.2;">${t.desc}</span>
                                    <span style="font-size: 0.75rem; color: #666; display: block;">
                                        ${t.date} • ${category}
                                    </span>
                                    <span style="font-size: 0.7rem; color: #888; font-weight: 500; display: block; margin-top: 2px;">
                                        <i class="fas fa-university" style="font-size: 0.6rem; margin-right: 3px;"></i> ${displayBank}
                                        <i class="fas fa-wallet" style="font-size: 0.6rem; margin-right: 3px; margin-left: 8px;"></i> ${t.paymentMethod || 'Pix'}
                                    </span>
                                </div>
                            </div>
                            
                            <div class="expand-btn" onclick="this.parentElement.classList.toggle('expanded')">
                                <i class="fas fa-chevron-down"></i> Exibir Detalhes e Ações
                            </div>

                            <div class="expand-content" style="text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end;">
                                <div style="font-family: 'JetBrains Mono'; font-weight: 700; font-size: 0.9rem; color: ${colorCode};">
                                    ${sign} R$ ${t.val.toFixed(2)}
                                </div>
                                <div style="margin-top: 8px; display: flex; gap: 15px;">
                                    <i class="fas fa-pen" onclick="FinanceModule.editTransaction(${t.id})" style="cursor: pointer; font-size: 0.9rem; color: #666;" title="Editar"></i>
                                    <i class="fas fa-trash" onclick="FinanceModule.deleteTransaction(${t.id})" style="cursor: pointer; font-size: 0.9rem; color: #666;" title="Excluir"></i>
                                </div>
                            </div>
                        </div>
                    `;
                    });

                    if (filteredTransactions.length === 0) {
                        log.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">Nenhum registro encontrado.</div>';
                    }
                }
            }
        };

        // --- 3.5 MÓDULO RECEITAS ---
        const FixedIncomeModule = {
            editingId: null,

            save() {
                const name = document.getElementById('inc-name').value;
                const val = parseFloat(document.getElementById('inc-val').value);
                const date = document.getElementById('inc-date').value;
                const cat = document.getElementById('inc-cat').value;

                if (name && !isNaN(val)) {
                    if (this.editingId) {
                        const item = DB.state.incomes.find(e => e.id === this.editingId);
                        if (item) {
                            item.name = name;
                            item.val = val;
                            item.date = date;
                            item.cat = cat;
                        }
                        this.editingId = null;
                        document.getElementById('btn-save-inc').innerText = 'Salvar';
                    } else {
                        DB.state.incomes.push({ id: Date.now(), name, val, date, cat, received: false });
                    }

                    document.getElementById('inc-name').value = '';
                    document.getElementById('inc-val').value = '';
                    DB.save();

                    const form = document.getElementById('inc-add-form');
                    form.classList.add('hidden');

                    this.render();
                } else { alert("Preencha Nome e Valor."); }
            },

            edit(id) {
                const item = DB.state.incomes.find(e => e.id === id);
                if (item) {
                    this.editingId = id;
                    document.getElementById('inc-name').value = item.name;
                    document.getElementById('inc-val').value = item.val;
                    document.getElementById('inc-date').value = item.date;
                    document.getElementById('inc-cat').value = item.cat || 'Salário';

                    document.getElementById('btn-save-inc').innerText = 'Atualizar';

                    const form = document.getElementById('inc-add-form');
                    form.classList.remove('hidden');

                    // Rola para o formulário
                    setTimeout(() => {
                        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 200);
                }
            },

            cancelEdit() {
                this.editingId = null;
                document.getElementById('inc-name').value = '';
                document.getElementById('inc-val').value = '';
                document.getElementById('btn-save-inc').innerText = 'Salvar';

                const form = document.getElementById('inc-add-form');
                form.classList.toggle('hidden');

                // SE ABRIU, ROLA A TELA
                if (!form.classList.contains('hidden')) {
                    // Delay aumentado para 200ms para garantir que o elemento existe no layout
                    setTimeout(() => {
                        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Foca no primeiro campo sem rolar de novo
                        document.getElementById('inc-name').focus({ preventScroll: true });
                    }, 200);
                }
            },

            toggle(id) {
                const inc = DB.state.incomes.find(e => e.id === id);
                if (inc) {
                    if (!inc.received) {
                        const btg = DB.state.banks.find(b => b.name.toLowerCase().includes('btg'));
                        if (!btg) return alert("Cadastre a conta BTG Pactual primeiro!");

                        if (confirm(`Receber R$ ${inc.val.toFixed(2)} no BTG Pactual?`)) {
                            inc.received = true;
                            btg.balance += inc.val;
                            const today = new Date().toLocaleDateString('pt-BR');

                            DB.state.transactions.unshift({
                                id: Date.now(),
                                date: today,
                                desc: `Receita Fixa: ${inc.name}`,
                                val: inc.val,
                                type: 'income',
                                accName: btg.name,
                                cat: inc.cat || 'Salário'
                            });
                            DB.save();
                        }
                    } else {
                        if (confirm("Desmarcar recebimento?")) {
                            inc.received = false;
                            DB.save();
                        }
                    }
                    this.render();
                }
            },

            delete(id) {
                if (confirm("Remover receita?")) {
                    DB.state.incomes = DB.state.incomes.filter(e => e.id !== id);
                    DB.save();
                    this.render();
                }
            },

            render() {
                const list = document.getElementById('inc-list-container');
                if (!list) return;
                list.innerHTML = '';
                const sorted = [...DB.state.incomes].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                let total = 0, received = 0;

                sorted.forEach(e => {
                    total += e.val;
                    if (e.received) received += e.val;
                    const statusColor = 'var(--color-success)';
                    const checkIcon = e.received ? 'fa-check-circle' : 'fa-circle';
                    const opacity = e.received ? '0.5' : '1';
                    const date = e.date ? e.date.split('-').reverse().join('/') : 'S/D';
                    const catIcon = FinanceModule.getCategoryIcon(e.cat || 'Salário');

                    list.innerHTML += `
                    <div class="habit-card-mini fade-in" style="opacity:${opacity}; border-left:3px solid ${statusColor}; padding:15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <i class="far ${checkIcon}" onclick="FixedIncomeModule.toggle(${e.id})" style="color:${statusColor}; cursor:pointer; font-size:1.5rem;"></i>
                                <div>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <i class="fas ${catIcon}" style="font-size:0.9rem; color:#aaa;"></i>
                                        <span style="font-weight:600;">${e.name}</span>
                                    </div>
                                    <span style="color:var(--color-success); font-weight:bold; display:block; margin-top:2px;">+ R$ ${e.val.toFixed(2)}</span>
                                    <small style="color:#666; display:block;">Prev: ${date}</small>
                                </div>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <i class="fas fa-pen" onclick="FixedIncomeModule.edit(${e.id})" style="cursor:pointer; color:#888; font-size:0.9rem;"></i>
                                <i class="fas fa-trash" onclick="FixedIncomeModule.delete(${e.id})" style="cursor:pointer; color:#666; font-size:1.1rem;"></i>
                            </div>
                        </div>
                    </div>
                `;
                });

                const remaining = total - received;
                const percent = total > 0 ? (received / total) * 100 : 0;
                const elTotal = document.getElementById('inc-total');
                if (elTotal) {
                    elTotal.innerText = `R$ ${total.toFixed(2)}`;
                    document.getElementById('inc-received').innerText = `R$ ${received.toFixed(2)}`;
                    document.getElementById('inc-remaining').innerText = `R$ ${remaining.toFixed(2)}`;
                    document.getElementById('inc-progress-bar').style.width = `${percent}%`;
                }
                if (list.innerHTML === '') list.innerHTML = '<div class="empty-state">Nenhuma receita fixa.</div>';
            }
        };

        // --- 4. MÓDULO GASTOS FIXOS ---
        const FixedExpensesModule = {
            editingId: null,

            save() {
                const name = document.getElementById('fixed-name').value;
                const val = parseFloat(document.getElementById('fixed-val').value);
                const date = document.getElementById('fixed-date').value;
                const time = document.getElementById('fixed-time').value;
                const cat = document.getElementById('fixed-cat').value;

                if (name && !isNaN(val)) {
                    if (this.editingId) {
                        const item = DB.state.fixed.find(e => e.id === this.editingId);
                        if (item) {
                            item.name = name;
                            item.val = val;
                            item.date = date;
                            item.time = time;
                            item.cat = cat;
                        }
                        this.editingId = null;
                        document.getElementById('btn-save-fix').innerText = 'Salvar';
                    } else {
                        DB.state.fixed.push({ id: Date.now(), name, val, date, time, cat, paid: false });
                    }

                    document.getElementById('fixed-name').value = '';
                    document.getElementById('fixed-val').value = '';
                    DB.save();

                    const form = document.getElementById('fixed-add-form');
                    form.classList.add('hidden');

                    this.render();

                } else { alert("Preencha Nome e Valor."); }
            },

            edit(id) {
                const item = DB.state.fixed.find(e => e.id === id);
                if (item) {
                    this.editingId = id;
                    document.getElementById('fixed-name').value = item.name;
                    document.getElementById('fixed-val').value = item.val;
                    document.getElementById('fixed-date').value = item.date;
                    document.getElementById('fixed-time').value = item.time;
                    document.getElementById('fixed-cat').value = item.cat || 'Moradia';

                    document.getElementById('btn-save-fix').innerText = 'Atualizar';

                    const form = document.getElementById('fixed-add-form');
                    form.classList.remove('hidden');

                    // Rola para o formulário
                    setTimeout(() => {
                        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 200);
                }
            },

            cancelEdit() {
                this.editingId = null;
                document.getElementById('fixed-name').value = '';
                document.getElementById('fixed-val').value = '';
                document.getElementById('btn-save-fix').innerText = 'Salvar';

                const form = document.getElementById('fixed-add-form');
                form.classList.toggle('hidden');

                // SE ABRIU, ROLA A TELA
                if (!form.classList.contains('hidden')) {
                    setTimeout(() => {
                        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        document.getElementById('fixed-name').focus({ preventScroll: true });
                    }, 200);
                }
            },

            toggle(id) {
                const expense = DB.state.fixed.find(e => e.id === id);
                if (expense) {
                    if (!expense.paid) {
                        const btg = DB.state.banks.find(b => b.name.toLowerCase().includes('btg'));
                        if (!btg) return alert("Cadastre a conta BTG Pactual primeiro!");

                        if (confirm(`Pagar R$ ${expense.val.toFixed(2)} pelo BTG Pactual?`)) {
                            expense.paid = true;
                            btg.balance -= expense.val;
                            const today = new Date().toLocaleDateString('pt-BR');
                            DB.state.transactions.unshift({
                                id: Date.now(),
                                date: today,
                                desc: `Pgto Fixo: ${expense.name}`,
                                val: expense.val,
                                type: 'expense',
                                accName: btg.name,
                                cat: expense.cat || 'Moradia'
                            });
                            DB.save();
                        }
                    } else {
                        if (confirm("Desmarcar pagamento?")) {
                            expense.paid = false;
                            DB.save();
                        }
                    }
                    this.render();
                }
            },

            delete(id) {
                if (confirm("Remover conta?")) {
                    DB.state.fixed = DB.state.fixed.filter(e => e.id !== id);
                    DB.save();
                    this.render();
                }
            },

            exportToCalendar(id) {
                const t = DB.state.fixed.find(e => e.id === id);
                if (!t || !t.date || !t.time) return alert("Defina Data e Hora!");
                const start = t.date.replace(/-/g, '') + 'T' + t.time.replace(/:/g, '') + '00';
                const icsContent = [
                    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
                    `DTSTART:${start}`, `DTEND:${start}`,
                    `SUMMARY:Pagar: ${t.name}`, `DESCRIPTION:Valor: R$ ${t.val}`,
                    'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM',
                    'END:VEVENT', 'END:VCALENDAR'
                ].join('\n');
                const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.setAttribute('download', `pagar_${t.name}.ics`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },

            render() {
                const list = document.getElementById('fixed-list-container');
                if (!list) return;
                list.innerHTML = '';

                const sorted = [...DB.state.fixed].sort((a, b) => {
                    if (a.date && b.date) return a.date.localeCompare(b.date);
                    return 0;
                });
                let totalVal = 0, paidVal = 0;

                sorted.forEach(e => {
                    totalVal += e.val;
                    if (e.paid) paidVal += e.val;

                    const statusColor = e.paid ? 'var(--color-success)' : 'var(--color-danger)';
                    const statusIcon = e.paid ? 'fa-check-circle' : 'fa-circle';
                    const opacity = e.paid ? '0.5' : '1';
                    const calendarBtn = (e.date && e.time && !e.paid) ? `<button onclick="FixedExpensesModule.exportToCalendar(${e.id})" style="background:none; border:none; color:var(--color-primary); cursor:pointer; margin-right:5px;"><i class="fas fa-calendar-plus" style="font-size: 1.1rem;"></i></button>` : '';
                    const dateTimeDisplay = e.date ? `<small style="color:#888; display:block;">Venc: ${e.date.split('-').reverse().join('/')} ${e.time || ''}</small>` : '<small style="color:#888;">Sem data</small>';
                    const catIcon = FinanceModule.getCategoryIcon(e.cat || 'Moradia');

                    list.innerHTML += `
                    <div class="habit-card-mini fade-in" style="opacity: ${opacity}; border-left: 3px solid ${statusColor}; padding: 15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <i class="far ${statusIcon}" onclick="FixedExpensesModule.toggle(${e.id})" style="color:${statusColor}; cursor:pointer; font-size:1.5rem;"></i>
                                <div>
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <i class="fas ${catIcon}" style="font-size:0.8rem; color:#888;"></i>
                                        <span style="font-weight:600;">${e.name}</span>
                                    </div>
                                    <span style="color:${statusColor}; font-weight:bold;">R$ ${e.val.toFixed(2)}</span>
                                    ${dateTimeDisplay}
                                </div>
                            </div>
                            <div style="display:flex; gap:10px; align-items:center;">
                                ${calendarBtn}
                                <i class="fas fa-pen" onclick="FixedExpensesModule.edit(${e.id})" style="cursor:pointer; color:#888; font-size:0.9rem;" title="Editar"></i>
                                <i class="fas fa-trash" onclick="FixedExpensesModule.delete(${e.id})" style="cursor:pointer; color:#666; font-size:1.1rem;"></i>
                            </div>
                        </div>
                    </div>
                `;
                });

                const remaining = totalVal - paidVal;
                const percent = totalVal > 0 ? (paidVal / totalVal) * 100 : 0;

                const elTotal = document.getElementById('fixed-total');
                if (elTotal) {
                    elTotal.innerText = `R$ ${totalVal.toFixed(2)}`;
                    document.getElementById('fixed-paid').innerText = `R$ ${paidVal.toFixed(2)}`;
                    document.getElementById('fixed-remaining').innerText = `R$ ${remaining.toFixed(2)}`;
                    document.getElementById('fixed-progress-bar').style.width = `${percent}%`;
                }

                if (list.innerHTML === '') list.innerHTML = '<div class="empty-state">Nenhuma despesa fixa.</div>';
            }
        };

        // --- 5. TASK MODULE (CORRIGIDO: SCROLL NO CONTAINER CERTO) ---
        const TaskModule = {
            save() {
                const desc = document.getElementById('task-input').value;
                const date = document.getElementById('task-date').value;
                const time = document.getElementById('task-time').value;
                const prio = document.getElementById('task-prio').value;
                const freq = document.getElementById('task-freq').value;

                if (desc) {
                    const btnCancel = document.getElementById('btn-task-cancel');

                    if (!btnCancel.classList.contains('hidden') && this.editingIndex !== undefined && this.editingIndex !== null) {
                        const task = DB.state.tasks[this.editingIndex];
                        task.desc = desc;
                        task.date = date;
                        task.time = time;
                        task.prio = prio;
                        task.freq = freq;
                        this.cancelEdit();
                    } else {
                        DB.state.tasks.push({ desc, date, time, prio, freq, done: false });
                    }

                    document.getElementById('task-input').value = '';
                    DB.save();
                    this.render();
                } else {
                    alert("Digite a descrição da tarefa.");
                }
            },

            editingIndex: null,

            edit(index) {
                const task = DB.state.tasks[index];
                this.editingIndex = index;

                document.getElementById('task-input').value = task.desc;
                document.getElementById('task-date').value = task.date;
                document.getElementById('task-time').value = task.time;
                document.getElementById('task-prio').value = task.prio;
                document.getElementById('task-freq').value = task.freq || 'Geral';

                const btnSave = document.getElementById('btn-task-save');
                btnSave.innerText = 'Salvar Alterações';
                btnSave.style.backgroundColor = 'var(--color-success)';

                document.getElementById('btn-task-cancel').classList.remove('hidden');

                // --- CORREÇÃO DA ROLAGEM ---
                const container = document.querySelector('.main-content'); // O container que realmente rola
                const inputField = document.getElementById('task-input');

                setTimeout(() => {
                    // Posição do input relativa à viewport
                    const elementRect = inputField.getBoundingClientRect();
                    // Posição do container relativa à viewport
                    const containerRect = container.getBoundingClientRect();
                    // Scroll atual
                    const currentScroll = container.scrollTop;

                    // Cálculo: Posição Atual + Diferença Visual - Espaço de Respiro
                    // offset = 190 (Quanto maior, mais para baixo da tela o input fica)
                    const offset = 190;

                    const targetPosition = currentScroll + (elementRect.top - containerRect.top) - offset;

                    container.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }, 50);
            },

            cancelEdit() {
                this.editingIndex = null;
                document.getElementById('task-input').value = '';

                const btnSave = document.getElementById('btn-task-save');
                btnSave.innerText = 'Adicionar';
                btnSave.style.backgroundColor = 'var(--color-primary)';

                document.getElementById('btn-task-cancel').classList.add('hidden');
            },

            toggle(index) {
                const task = DB.state.tasks[index];
                task.done = !task.done;
                DB.save();
                this.render();

                const todayStr = getLocalTodayString();

                // SE MARCOU COMO CONCLUÍDA
                if (task.done) {
                    // Caso 1: Se a tarefa era para o futuro (adiantada)
                    if (task.date && task.date > todayStr) {
                        setTimeout(() => {
                            System.showCongratsModal(
                                "INCRÍVEL!",
                                "Você acaba de adiantar uma tarefa futura. Produtividade extrema!"
                            );
                        }, 200);
                    }
                    // Caso 2: Se a tarefa era para hoje
                    else if (task.date === todayStr) {
                        setTimeout(() => {
                            System.showCongratsModal(
                                "BOM TRABALHO!",
                                "Mais uma tarefa de hoje concluída. O sucesso é construído na rotina!"
                            );
                        }, 200);
                    }
                }

                // Sempre pede pro sistema checar se a meta total do dia foi batida
                // Colocamos um delay um pouco maior para que, se for 100%, ele substitua a mensagem acima.
                setTimeout(() => { System.checkDailyGoal(); }, 150);
            },

            delete(index) {
                if (confirm("Excluir tarefa?")) {
                    if (this.editingIndex === index) this.cancelEdit();
                    DB.state.tasks.splice(index, 1);
                    DB.save();
                    this.render();
                }
            },

            exportToCalendar(index) {
                const t = DB.state.tasks[index];
                if (!t.date || !t.time) return alert("Defina Data e Hora!");
                const start = t.date.replace(/-/g, '') + 'T' + t.time.replace(/:/g, '') + '00';
                const icsContent = [
                    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
                    `DTSTART:${start}`, `DTEND:${start}`,
                    `SUMMARY:Caverna: ${t.desc}`, `DESCRIPTION:Prio: ${t.prio}`,
                    'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM',
                    'END:VEVENT', 'END:VCALENDAR'
                ].join('\n');
                const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.setAttribute('download', 'tarefa.ics');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },

            render() {
                if (typeof ChartsModule !== 'undefined') ChartsModule.renderTaskPerformance();

                const list = document.getElementById('task-list-container');
                const filter = document.getElementById('task-view-filter').value;

                if (!list) return;
                list.innerHTML = '';

                const todayDate = getLocalTodayString();

                const sortedTasks = [...DB.state.tasks].sort((a, b) => {
                    if (a.date !== b.date) {
                        if (!a.date) return 1;
                        if (!b.date) return -1;
                        return a.date.localeCompare(b.date);
                    }
                    const pWeight = { 'HIGH': 3, 'MED': 2, 'LOW': 1 };
                    if (pWeight[b.prio] !== pWeight[a.prio]) {
                        return pWeight[b.prio] - pWeight[a.prio];
                    }
                    return (a.time || '').localeCompare(b.time || '');
                });

                let hasItems = false;

                sortedTasks.forEach((t) => {
                    const originalIndex = DB.state.tasks.indexOf(t);

                    // --- CORREÇÃO DO FILTRO DA LISTA DE TAREFAS ---
                    if (filter === 'today' && t.date !== todayDate) return;
                    if (filter === 'high' && t.prio !== 'HIGH') return;
                    if (filter === 'low' && t.prio !== 'LOW') return;
                    if (filter === 'date') {
                        const historyDate = document.getElementById('task-history-date').value;
                        if (!historyDate || t.date !== historyDate) return;
                    }
                    // O filtro 'all' passa direto sem sofrer 'return', mostrando tudo.

                    hasItems = true;

                    const prioClass = t.prio === 'HIGH' ? 'p-high' : (t.prio === 'MED' ? 'p-med' : 'p-low');
                    const prioText = t.prio === 'HIGH' ? 'Alta' : (t.prio === 'MED' ? 'Média' : 'Baixa');

                    const checkIcon = t.done ? 'fa-check-circle' : 'fa-circle';
                    const checkColor = t.done ? 'var(--color-success)' : '#444';
                    const titleClass = t.done ? 'item-done' : '';

                    let displayDate = '';
                    if (t.date) {
                        const parts = t.date.split('-');
                        const diaMes = `${parts[2]}/${parts[1]}`;
                        displayDate = (t.date === todayDate) ? 'Hoje' : diaMes;
                    }

                    let dateTimeHTML = '';
                    if (displayDate || t.time) {
                        dateTimeHTML = `<small style="color:var(--color-primary); font-weight:600; white-space:nowrap; margin-left: 6px;">
                        <i class="far fa-calendar" style="font-size:0.7rem; margin-right:2px;"></i> ${displayDate} ${t.time || ''}
                    </small>`;
                    }

                    const statusBadge = t.done ? '<span class="cat-badge" style="background:var(--color-success); color:#000;">Concluído</span>' : '';

                    const calendarBtn = (t.date && t.time && !t.done)
                        ? `<button onclick="TaskModule.exportToCalendar(${originalIndex})" style="background:none; border:none; color:var(--color-primary); cursor:pointer; padding:0; margin-right:-3px;"><i class="fas fa-calendar-plus" style="font-size: 1.1rem;"></i></button>`
                        : '';

                    list.innerHTML += `
                    <div class="task-item fade-in mobile-expandable">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap;">
                            
                            <div style="display:flex; align-items:center; gap:15px; flex:1; min-width:0;">
                                <i class="far ${checkIcon}" onclick="TaskModule.toggle(${originalIndex})" style="color:${checkColor}; cursor:pointer; font-size:1.5rem; flex-shrink:0;"></i>
                                <div style="min-width:0;">
                                    <span class="${titleClass}" style="font-weight:600; display:block; word-break:break-word;">${t.desc}</span>
                                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin-top:4px;">
                                        <span class="priority-badge mono ${prioClass}" style="font-size:0.6rem; padding:1px 4px;">${prioText}</span>
                                        <span class="cat-badge" style="font-size:0.6rem;">${t.freq || 'Geral'}</span>
                                        ${statusBadge}
                                        ${dateTimeHTML}
                                    </div>
                                </div>
                            </div>

                            <div class="expand-btn" onclick="this.parentElement.parentElement.classList.toggle('expanded')">
                                <i class="fas fa-chevron-down"></i> Opções da Tarefa
                            </div>

                            <div class="expand-content" style="display:flex; gap:10px; align-items:center; margin-left:10px; flex-shrink:0;">
                                ${calendarBtn}
                                <i class="fas fa-pen" onclick="TaskModule.edit(${originalIndex})" style="cursor:pointer; color:#888; font-size:0.9rem;" title="Editar"></i>
                                <i class="fas fa-trash" onclick="TaskModule.delete(${originalIndex})" style="cursor:pointer; color:#666; font-size:1.1rem;" title="Excluir"></i>
                            </div>

                        </div>
                    </div>
                `;
                });

                if (!hasItems) list.innerHTML = '<div class="empty-state">Nenhuma tarefa encontrada neste filtro.</div>';
            }
        };

        // --- FUNÇÃO AUXILIAR CENTRAL PARA DATA LOCAL ---
        // Garante que a data retorne sempre YYYY-MM-DD no horário EXATO da máquina do usuário
        function getLocalTodayString(dateObj = new Date()) {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // --- 6. HABIT MODULE (TOTALMENTE REVISADO COM HISTÓRICO E JUSTIFICATIVAS) ---
        const HabitModule = {
            editingIdx: null,

            isRequiredForDate(h, dObj) {
                const freq = h.freq || 'Diário';
                const dayOfWeek = dObj.getDay();

                if (freq === 'Mensal' || freq === 'Quinzenal') return true;

                let days = [0, 1, 2, 3, 4, 5, 6];
                if (freq === 'Dias Úteis') days = [1, 2, 3, 4, 5];
                else if (['Semanal', 'FDS A', 'FDS B'].includes(freq)) {
                    days = (h.activeDays && Array.isArray(h.activeDays) && h.activeDays.length > 0) ? h.activeDays.map(Number) : [0, 6];
                }

                if (!days.includes(dayOfWeek)) return false;

                if (freq === 'FDS A' || freq === 'FDS B') {
                    const dataBaseA = new Date(2026, 1, 21); dataBaseA.setHours(0, 0, 0, 0);
                    // Use UTC to avoid daylight saving time diff issues if any
                    const utc1 = Date.UTC(dObj.getFullYear(), dObj.getMonth(), dObj.getDate());
                    const utc2 = Date.UTC(dataBaseA.getFullYear(), dataBaseA.getMonth(), dataBaseA.getDate());
                    const diffDays = Math.floor((utc1 - utc2) / (1000 * 60 * 60 * 24));
                    const diffWeeks = Math.floor(diffDays / 7);
                    const isFdsA_Ativo = (Math.abs(diffWeeks % 2) === 0);

                    if (freq === 'FDS A' && !isFdsA_Ativo) return false;
                    if (freq === 'FDS B' && isFdsA_Ativo) return false;
                }

                return true;
            },


            // === NOVA FUNÇÃO: ADICIONAR MOTIVO/JUSTIFICATIVA ===
            addReason(hIdx, dateKey) {
                if (!DB.state.habits[hIdx].reasons) {
                    DB.state.habits[hIdx].reasons = {};
                }

                const currentReason = DB.state.habits[hIdx].reasons[dateKey] || '';
                const dataFormatada = dateKey.split('-').reverse().join('/');
                const newReason = prompt(`Qual o motivo de não realizar o hábito no dia ${dataFormatada}?`, currentReason);

                if (newReason !== null) { // Se o usuário não clicou em "Cancelar"
                    if (newReason.trim() === '') {
                        delete DB.state.habits[hIdx].reasons[dateKey]; // Apaga se deixar em branco
                    } else {
                        DB.state.habits[hIdx].reasons[dateKey] = newReason.trim();
                    }
                    DB.save();
                    this.render();

                    // Se o modal de histórico estiver aberto, atualiza ele na hora para mostrar o motivo
                    if (document.getElementById('productivity-modal').classList.contains('active')) {
                        this.showHistory(hIdx);
                    }
                }
            },

            // === MOSTRAR HISTÓRICO COM SCROLL E JUSTIFICATIVA ===
            showHistory(hIdx) {
                const h = DB.state.habits[hIdx];
                const modalTitle = document.getElementById('prod-modal-title');
                modalTitle.innerHTML = `<i class="fas fa-history" style="color:var(--color-primary)"></i> Histórico: ${h.txt}`;
                modalTitle.style.color = '#fff';

                const modalBody = document.getElementById('prod-modal-body');
                modalBody.innerHTML = '';

                const checks = h.checks || {};
                const reasons = h.reasons || {};
                const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);

                let habitStartDate = new Date(2026, 0, 24);
                if (h.createdAt) {
                    const cp = h.createdAt.split('-');
                    if (cp.length === 3) habitStartDate = new Date(cp[0], cp[1] - 1, cp[2]);
                }
                habitStartDate.setHours(0, 0, 0, 0);

                let totalDays = Math.floor((todayObj.getTime() - habitStartDate.getTime()) / 86400000);
                if (totalDays < 0) totalDays = 0;

                let hasHistory = false;

                // Varre desde hoje até o dia que o hábito foi criado (Scroll infinito)
                for (let j = 0; j <= totalDays; j++) {
                    const dObj = new Date(todayObj);
                    dObj.setDate(dObj.getDate() - j);
                    const dateKey = getLocalTodayString(dObj);
                    const isChecked = !!checks[dateKey];

                    const required = this.isRequiredForDate(h, dObj);
                    const formatData = dateKey.split('-').reverse().join('/');

                    if (!required && !isChecked) {
                        hasHistory = true;
                        modalBody.innerHTML += `
                            <div style="background: rgba(255,255,255,0.01); padding: 15px; border-radius: 8px; margin-bottom: 10px; display:flex; justify-content:space-between; align-items:center; border-left: 3px solid #333; opacity: 0.5;">
                                <div>
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <i class="fas fa-minus-circle" style="color:#555; font-size: 1.2rem;"></i>
                                        <span style="font-weight:700; font-size:0.95rem; color:#888;">${formatData}</span>
                                    </div>
                                    <div style="font-size:0.8rem; color:#666; margin-top:4px; font-style:italic;">Não agendado para este dia.</div>
                                </div>
                            </div>
                        `;
                        continue;
                    }

                    const icon = isChecked ? '<i class="fas fa-check-circle" style="color:var(--color-success); font-size: 1.2rem;"></i>' : '<i class="fas fa-times-circle" style="color:var(--color-danger); font-size: 1.2rem;"></i>';

                    const reasonText = reasons[dateKey] || '';
                    let reasonHtml = '';
                    if (!isChecked) {
                        reasonHtml = reasonText
                            ? `<div style="font-size:0.8rem; color:#f59e0b; margin-top:4px;"><i class="fas fa-exclamation-circle"></i> Motivo: ${reasonText}</div>`
                            : `<div style="font-size:0.8rem; color:#666; margin-top:4px; font-style:italic;">Sem justificativa registrada.</div>`;
                    }

                    const btnJustify = !isChecked ? `<button onclick="HabitModule.addReason(${hIdx}, '${dateKey}')" style="background:transparent; border:1px solid #f59e0b; color:#f59e0b; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:0.75rem; font-weight:bold; transition:0.2s;">Justificar</button>` : '';
                    const btnConcluir = !isChecked ? `<button onclick="HabitModule.toggleDay(${hIdx}, '${dateKey}'); HabitModule.showHistory(${hIdx});" style="background:var(--color-success); border:none; color:#000; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:0.75rem; font-weight:bold; margin-left:5px; transition:0.2s;">Concluir</button>` : '';
                    const btnDesfazer = isChecked ? `<button onclick="HabitModule.toggleDay(${hIdx}, '${dateKey}'); HabitModule.showHistory(${hIdx});" style="background:transparent; border:1px solid #666; color:#888; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:0.75rem; font-weight:bold; transition:0.2s;">Desfazer</button>` : '';

                    hasHistory = true;
                    modalBody.innerHTML += `
                        <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; margin-bottom: 10px; display:flex; justify-content:space-between; align-items:center; border-left: 3px solid ${isChecked ? 'var(--color-success)' : 'var(--color-danger)'};">
                            <div>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    ${icon}
                                    <span style="font-weight:700; font-size:0.95rem;">${formatData}</span>
                                    ${j === 0 ? '<span style="font-size:0.6rem; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">HOJE</span>' : ''}
                                </div>
                                ${reasonHtml}
                            </div>
                            <div style="display:flex; align-items:center;">
                                ${btnJustify}
                                ${btnConcluir}
                                ${btnDesfazer}
                            </div>
                        </div>
                    `;
                }

                if (!hasHistory) {
                    modalBody.innerHTML = '<div style="color:#888; text-align:center; padding: 20px; font-size: 0.9rem;">Nenhum histórico registrado para este hábito.</div>';
                }

                document.getElementById('productivity-modal').classList.add('active');
            },

            toggleDaysSelection() {
                const freqEl = document.getElementById('habit-freq');
                const daysDiv = document.getElementById('habit-days-selection');
                if (freqEl && daysDiv) {
                    if (['Semanal', 'FDS A', 'FDS B', 'Quinzenal'].includes(freqEl.value)) {
                        daysDiv.classList.remove('hidden');
                    } else {
                        daysDiv.classList.add('hidden');
                    }
                }
            },

            toggleDay(hIdx, dateKey) {
                if (DB.state.habits[hIdx].completed) return;

                if (!DB.state.habits[hIdx].checks || Array.isArray(DB.state.habits[hIdx].checks)) {
                    DB.state.habits[hIdx].checks = {};
                }

                let isMarkingAsDone = false;
                if (DB.state.habits[hIdx].checks[dateKey]) {
                    delete DB.state.habits[hIdx].checks[dateKey];
                } else {
                    DB.state.habits[hIdx].checks[dateKey] = true;
                    isMarkingAsDone = true;
                }

                DB.save();
                this.render();
                StreakModule.updateUI();

                const todayStr = getLocalTodayString();

                if (isMarkingAsDone) {
                    if (dateKey > todayStr) {
                        setTimeout(() => {
                            System.showCongratsModal("INCRÍVEL!", "Você acaba de <b>adiantar</b> um hábito futuro. Produtividade extrema!");
                        }, 300);
                    }
                    else {
                        setTimeout(() => { System.checkDailyGoal(); }, 150);
                    }
                }
            },

            save() {
                const txt = document.getElementById('habit-input').value;
                const desc = document.getElementById('habit-desc').value;
                const freq = document.getElementById('habit-freq').value;
                const time = document.getElementById('habit-time').value;

                let selectedDays = [0, 1, 2, 3, 4, 5, 6];
                if (freq === 'Dias Úteis') {
                    selectedDays = [1, 2, 3, 4, 5];
                } else if (['Semanal', 'FDS A', 'FDS B', 'Quinzenal'].includes(freq)) {
                    selectedDays = [];
                    if (document.getElementById('habit-day-6').checked) selectedDays.push(6);
                    if (document.getElementById('habit-day-0').checked) selectedDays.push(0);

                    if (selectedDays.length === 0) {
                        alert("Selecione Sábado e/ou Domingo para rotinas de Fim de Semana.");
                        return;
                    }
                }

                if (txt) {
                    const btnCancel = document.getElementById('btn-habit-cancel');

                    if (!btnCancel.classList.contains('hidden') && this.editingIdx !== null) {
                        DB.state.habits[this.editingIdx].txt = txt;
                        DB.state.habits[this.editingIdx].desc = desc;
                        DB.state.habits[this.editingIdx].freq = freq;
                        DB.state.habits[this.editingIdx].time = time;
                        DB.state.habits[this.editingIdx].activeDays = selectedDays;
                        this.cancelEdit();
                    } else {
                        const todayStr = getLocalTodayString();
                        DB.state.habits.push({
                            txt,
                            desc,
                            freq,
                            time,
                            checks: {},
                            reasons: {}, // Instancia o objeto de motivos vazio
                            completed: false,
                            createdAt: todayStr,
                            activeDays: selectedDays
                        });
                    }

                    document.getElementById('habit-input').value = '';
                    document.getElementById('habit-desc').value = '';
                    document.getElementById('habit-time').value = '';
                    this.toggleDaysSelection();
                    DB.save();
                    this.render();
                } else { alert("Digite o nome da atividade."); }
            },

            edit(index) {
                const h = DB.state.habits[index];
                this.editingIdx = index;

                document.getElementById('habit-input').value = h.txt;
                document.getElementById('habit-desc').value = h.desc || '';
                document.getElementById('habit-freq').value = h.freq || 'Diário';
                document.getElementById('habit-time').value = h.time || '';

                this.toggleDaysSelection();

                if (['Semanal', 'FDS A', 'FDS B', 'Quinzenal'].includes(h.freq)) {
                    const days = h.activeDays || [0, 6];
                    document.getElementById('habit-day-6').checked = days.includes(6);
                    document.getElementById('habit-day-0').checked = days.includes(0);
                }

                const btn = document.getElementById('btn-habit-save');
                btn.innerText = 'Salvar Alterações';
                btn.style.backgroundColor = 'var(--color-success)';
                document.getElementById('btn-habit-cancel').classList.remove('hidden');

                const container = document.querySelector('.main-content');
                const inputField = document.getElementById('habit-input');

                setTimeout(() => {
                    const elementRect = inputField.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    const currentScroll = container.scrollTop;
                    const offset = 190;
                    const targetPosition = currentScroll + (elementRect.top - containerRect.top) - offset;
                    container.scrollTo({ top: targetPosition, behavior: 'smooth' });
                }, 50);
            },

            cancelEdit() {
                this.editingIdx = null;
                document.getElementById('habit-input').value = '';
                document.getElementById('habit-desc').value = '';
                document.getElementById('habit-time').value = '';
                document.getElementById('habit-freq').value = 'Diário';
                document.getElementById('habit-day-6').checked = true;
                document.getElementById('habit-day-0').checked = true;
                this.toggleDaysSelection();

                const btn = document.getElementById('btn-habit-save');
                btn.innerText = 'Adicionar';
                btn.style.backgroundColor = 'var(--color-primary)';
                document.getElementById('btn-habit-cancel').classList.add('hidden');
            },

            delete(index) {
                if (confirm("Apagar atividade permanentemente?")) {
                    if (this.editingIdx === index) this.cancelEdit();
                    DB.state.habits.splice(index, 1);
                    DB.save();
                    this.render();
                }
            },

            render() {
                if (typeof ChartsModule !== 'undefined') ChartsModule.renderHabitPerformance();

                const container = document.getElementById('habit-list-container');
                const filterEl = document.getElementById('habit-view-filter');
                if (!container) return;
                container.innerHTML = '';

                const filterSelect = filterEl ? filterEl.value : 'hoje';

                const dLocal = new Date();
                const todayStr = getLocalTodayString(dLocal);
                const todayDayOfWeek = dLocal.getDay();

                const dataBaseA = new Date(2026, 1, 21); dataBaseA.setHours(0, 0, 0, 0);
                const diasPassados = Math.floor((dLocal.getTime() - dataBaseA.getTime()) / (1000 * 60 * 60 * 24));
                const semanasPassadas = Math.floor(diasPassados / 7);
                const isFdsA_Ativo = (Math.abs(semanasPassadas % 2) === 0);

                const mappedHabits = DB.state.habits.map((h, i) => ({ ...h, originalIndex: i }));

                const getSafeActiveDays = (h) => {
                    const freq = h.freq || 'Diário';
                    if (freq === 'Diário') return [0, 1, 2, 3, 4, 5, 6];
                    if (freq === 'Dias Úteis') return [1, 2, 3, 4, 5];
                    if (h.activeDays && Array.isArray(h.activeDays) && h.activeDays.length > 0) return h.activeDays.map(Number);
                    if (['Semanal', 'FDS A', 'FDS B'].includes(freq)) return [0, 6];
                    return [0, 1, 2, 3, 4, 5, 6];
                };

                const checkEhPraHoje = (freq, days, checks) => {
                    if (freq === 'Mensal') {
                        const currentMonthStr = todayStr.slice(0, 7);
                        let jaFezPeriodo = Object.keys(checks).some(dateStr => dateStr.startsWith(currentMonthStr));
                        return !jaFezPeriodo || !!checks[todayStr];
                    } else if (freq === 'Quinzenal') {
                        let jaFezPeriodo = false;
                        for (let j = 0; j <= 15; j++) {
                            const temp = new Date(dLocal);
                            temp.setDate(temp.getDate() - j);
                            if (checks[getLocalTodayString(temp)]) { jaFezPeriodo = true; break; }
                        }
                        return !jaFezPeriodo || !!checks[todayStr];
                    } else if (freq === 'FDS A') {
                        return isFdsA_Ativo && days.includes(todayDayOfWeek);
                    } else if (freq === 'FDS B') {
                        return !isFdsA_Ativo && days.includes(todayDayOfWeek);
                    } else {
                        return days.includes(todayDayOfWeek);
                    }
                };

                mappedHabits.sort((a, b) => {
                    const aFreq = a.freq || 'Diário';
                    const bFreq = b.freq || 'Diário';
                    const aDays = getSafeActiveDays(a);
                    const bDays = getSafeActiveDays(b);

                    const aHoje = checkEhPraHoje(aFreq, aDays, a.checks || {});
                    const bHoje = checkEhPraHoje(bFreq, bDays, b.checks || {});

                    const aFeito = !!(a.checks && a.checks[todayStr]);
                    const bFeito = !!(b.checks && b.checks[todayStr]);

                    if (aHoje !== bHoje) return aHoje ? -1 : 1;
                    if (aHoje && bHoje && aFeito !== bFeito) return aFeito ? 1 : -1;

                    const timeA = a.time || '23:59';
                    const timeB = b.time || '23:59';
                    if (timeA !== timeB) return timeA.localeCompare(timeB);

                    const pesoFreq = { 'Diário': 1, 'Dias Úteis': 2, 'Semanal': 3, 'FDS A': 4, 'FDS B': 5, 'Quinzenal': 6, 'Mensal': 7 };
                    return (pesoFreq[aFreq] || 99) - (pesoFreq[bFreq] || 99);
                });

                let hasItems = false;

                mappedHabits.forEach((h) => {
                    const i = h.originalIndex;
                    const hFreq = h.freq || 'Diário';
                    const hTime = h.time || '';

                    const d = getSafeActiveDays(h);
                    const ehPraHoje = checkEhPraHoje(hFreq, d, h.checks || {});

                    if (filterSelect !== 'all') {
                        if (filterSelect === 'hoje' && !ehPraHoje) return;
                        if (filterSelect !== 'hoje' && hFreq !== filterSelect) return;
                    }

                    hasItems = true;
                    let safeChecks = h.checks || {};
                    let safeReasons = h.reasons || {};
                    const isCheckedToday = !!safeChecks[todayStr];
                    const todayReason = safeReasons[todayStr];

                    const checkIcon = isCheckedToday ? 'fa-check-circle' : 'fa-circle';
                    const checkColor = isCheckedToday ? 'var(--color-success)' : '#444';
                    const titleClass = isCheckedToday ? 'item-done' : '';

                    let badgeColor = 'rgba(255,255,255,0.1)';
                    let freqDisplay = hFreq;

                    if (hFreq === 'FDS A' || hFreq === 'FDS B') {
                        badgeColor = hFreq === 'FDS A' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';

                        let daysLabel = '';
                        if (d.includes(6) && d.includes(0)) daysLabel = 'Sáb/Dom';
                        else if (d.includes(6)) daysLabel = 'Sábado';
                        else if (d.includes(0)) daysLabel = 'Domingo';

                        freqDisplay = daysLabel ? `${hFreq} (${daysLabel})` : hFreq;

                        if (hFreq === 'FDS A' && !isFdsA_Ativo) freqDisplay += ' (Próxima)';
                        if (hFreq === 'FDS B' && isFdsA_Ativo) freqDisplay += ' (Próxima)';
                    } else if (hFreq === 'Semanal') {
                        let daysLabel = '';
                        if (d.includes(6) && d.includes(0)) daysLabel = 'Sáb/Dom';
                        else if (d.includes(6)) daysLabel = 'Sábado';
                        else if (d.includes(0)) daysLabel = 'Domingo';
                        if (daysLabel) freqDisplay = `Semanal (${daysLabel})`;
                    }

                    const dateTimeHTML = hTime ? `<small style="color:var(--color-primary); font-weight:600; white-space:nowrap; margin-left: 6px;">
                                        <i class="far fa-clock" style="font-size:0.7rem; margin-right:2px;"></i> ${hTime}
                                      </small>` : '';

                    const descHTML = h.desc ? `<div style="font-size:0.75rem; color:#888; margin-top:4px; line-height:1.2;"><i class="fas fa-align-left" style="font-size:0.65rem; margin-right:4px;"></i>${h.desc}</div>` : '';

                    // Se houver um motivo justificado para o dia de HOJE, exibe ele no cartão.
                    const reasonDisplayHTML = (todayReason && !isCheckedToday) ? `<div style="font-size:0.75rem; color:#f59e0b; margin-top:4px; font-style: italic; line-height:1.2;"><i class="fas fa-exclamation-circle" style="font-size:0.65rem; margin-right:4px;"></i>Motivo: ${todayReason}</div>` : '';

                    container.innerHTML += `
                    <div class="task-item fade-in">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                            
                            <div style="display:flex; align-items:center; gap:15px; flex:1; min-width:0;">
                                <i class="far ${checkIcon}" onclick="HabitModule.toggleDay(${i}, '${todayStr}')" style="color:${checkColor}; cursor:pointer; font-size:1.5rem; flex-shrink:0;"></i>
                                
                                <div style="min-width:0;">
                                    <span class="${titleClass}" style="font-weight:600; display:block; word-break:break-word;">${h.txt}</span>
                                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin-top:4px;">
                                        <span class="cat-badge" style="background:${badgeColor}">${freqDisplay}</span>
                                        ${dateTimeHTML}
                                    </div>
                                    ${descHTML} 
                                    ${reasonDisplayHTML}
                                </div>
                            </div>

                            <div style="display:flex; gap:12px; align-items:center; margin-left:10px; flex-shrink:0;">
                                <i class="fas fa-history" onclick="HabitModule.showHistory(${i})" style="cursor:pointer; color:var(--color-primary); font-size:1rem;" title="Ver Histórico e Justificar"></i>
                                <i class="fas fa-pen" onclick="HabitModule.edit(${i})" style="cursor:pointer; color:#888; font-size:0.9rem;" title="Editar"></i>
                                <i class="fas fa-trash" onclick="HabitModule.delete(${i})" style="cursor:pointer; color:#666; font-size:1.1rem;" title="Excluir"></i>
                            </div>

                        </div>
                    </div>
                `;
                });

                if (!hasItems) container.innerHTML = '<div class="empty-state">Nenhum hábito cadastrado neste filtro.</div>';
            }
        };

        // --- 7. LIBRARY MODULE (ATUALIZADO: TAG CONCLUÍDO) ---
        const LibraryModule = {
            editingIndex: null,

            save() {
                const title = document.getElementById('lib-title').value;
                const type = document.getElementById('lib-type').value;
                const freq = document.getElementById('lib-freq').value;
                const note = document.getElementById('lib-note').value;

                if (title) {
                    if (this.editingIndex !== null) {
                        const item = DB.state.library[this.editingIndex];
                        item.title = title;
                        item.type = type;
                        item.freq = freq;
                        item.note = note;
                        this.cancelEdit();
                    } else {
                        DB.state.library.push({ title, type, freq, note, done: false });
                    }

                    document.getElementById('lib-title').value = '';
                    document.getElementById('lib-note').value = '';
                    DB.save();
                    this.render();
                } else {
                    alert("Digite o título.");
                }
            },

            edit(index) {
                const item = DB.state.library[index];
                if (item) {
                    this.editingIndex = index;
                    document.getElementById('lib-title').value = item.title;
                    document.getElementById('lib-type').value = item.type;
                    document.getElementById('lib-freq').value = item.freq || 'Diário';
                    document.getElementById('lib-note').value = item.note || '';

                    const btnSave = document.getElementById('btn-lib-save');
                    btnSave.innerText = 'Salvar Alterações';
                    btnSave.style.backgroundColor = 'var(--color-success)';

                    document.getElementById('btn-lib-cancel').classList.remove('hidden');
                    document.getElementById('lib-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            },

            cancelEdit() {
                this.editingIndex = null;
                document.getElementById('lib-title').value = '';
                document.getElementById('lib-note').value = '';

                const btnSave = document.getElementById('btn-lib-save');
                btnSave.innerText = 'Adicionar';
                btnSave.style.backgroundColor = 'var(--color-primary)';

                document.getElementById('btn-lib-cancel').classList.add('hidden');
            },

            toggle(index) {
                DB.state.library[index].done = !DB.state.library[index].done;
                DB.save();
                this.render();
            },

            delete(i) {
                if (confirm("Remover da biblioteca?")) {
                    if (this.editingIndex === i) this.cancelEdit();
                    DB.state.library.splice(i, 1);
                    DB.save();
                    this.render();
                }
            },

            render() {
                const list = document.getElementById('library-list-container');
                const filterEl = document.getElementById('lib-view-filter');
                if (!list) return;

                const filter = filterEl ? filterEl.value : 'all';
                list.innerHTML = '';

                let hasItems = false;

                DB.state.library.forEach((item, i) => {
                    if (filter !== 'all' && item.freq !== filter) return;
                    hasItems = true;

                    const iconType = item.type === 'book' ? 'fa-book' : 'fa-laptop-code';
                    const meta = item.freq || 'Geral';
                    const titleClass = item.done ? 'item-done' : '';
                    const checkIcon = item.done ? 'fa-check-circle' : 'fa-circle';

                    // Exibe a nota se existir
                    const noteDisplay = item.note
                        ? `<div style="font-size:0.75rem; color:#ef4444; margin-top:2px; font-family:'JetBrains Mono';"><i class="fas fa-bookmark" style="font-size:0.7rem; margin-right:4px;"></i>${item.note}</div>`
                        : '';

                    // Tag Concluído (IGUAL AOS HÁBITOS)
                    const statusBadge = item.done ? '<span class="cat-badge" style="background:var(--color-success); color:#000;">Concluído</span>' : '';

                    list.innerHTML += `
                    <div class="task-item fade-in">
                        <div style="display:flex; align-items:center; gap:10px; width:100%;">
                            <i class="far ${checkIcon}" onclick="LibraryModule.toggle(${i})" style="cursor:pointer; font-size:1.1rem; min-width:20px;"></i>
                            <div style="display:flex; align-items:center; gap:10px; flex:1;">
                                <i class="fas ${iconType}" style="color:var(--color-primary); opacity:0.8;"></i>
                                <div>
                                    <span class="${titleClass}" style="display:block; font-weight:500;">${item.title}</span>
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span class="cat-badge" style="margin-left:0; font-size:0.6rem;">${meta}</span>
                                        ${statusBadge}
                                    </div>
                                    ${noteDisplay}
                                </div>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <i class="fas fa-pen" onclick="LibraryModule.edit(${i})" style="cursor:pointer; color:#888; font-size:0.9rem;" title="Editar"></i>
                                <i class="fas fa-trash" onclick="LibraryModule.delete(${i})" style="cursor:pointer; color:#666; font-size:1rem;"></i>
                            </div>
                        </div>
                    </div>
                `;
                });
                if (!hasItems) list.innerHTML = '<div class="empty-state">Biblioteca vazia.</div>';
            }
        };

        // --- 8. CHARTS MODULE (BLINDADO CONTRA BUGS E FUSO HORÁRIO) ---
        const ChartsModule = {
            instances: {},

            commonOptions: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 800,
                    animateScale: true,
                    animateRotate: true
                },
                plugins: { legend: { display: false } }
            },

            // Cores fixas para as categorias
            catColors: {
                'Moradia': '#3b82f6',       // Azul
                'Alimentação': '#ef4444',   // Vermelho
                'Transporte': '#f59e0b',    // Laranja
                'Educação': '#8b5cf6',      // Roxo
                'Lazer/Assinaturas': '#ec4899', // Rosa
                'Saúde/Cuidados': '#10b981', // Verde Esmeralda
                'Compras': '#06b6d4',       // Ciano
                'Investimento': '#14b8a6',  // Teal
                'Salário': '#22c55e',       // Verde Claro
                'Outros': '#6b7280'         // Cinza
            },

            renderAll() {
                const dash = document.getElementById('dashboard');
                if (dash && !dash.classList.contains('hidden')) {
                    // Travas de segurança para um erro não derrubar a tela toda
                    setTimeout(() => {
                        try { this.renderRadar(); } catch (e) { console.error(e) }
                        try { this.renderDist(); } catch (e) { console.error(e) }
                        try { this.renderFlow(); } catch (e) { console.error(e) }
                        try { this.renderCategoryPie(); } catch (e) { console.error(e) }
                    }, 100);
                }
                setTimeout(() => {
                    try { this.renderHabitPerformance(); } catch (e) { console.error(e) }
                    try { this.renderTaskPerformance(); } catch (e) { console.error(e) }
                    try { this.renderLibraryPerformance(); } catch (e) { console.error(e) }
                }, 100);
            },

            // --- 1. GRÁFICO DE PIZZA (CATEGORIAS) ---
            renderCategoryPie() {
                const ctx = document.getElementById('categoryPieChart'); if (!ctx) return;
                const filterEl = document.getElementById('cat-pie-filter');
                const monthFilterEl = document.getElementById('cat-pie-month-filter');

                const type = filterEl ? filterEl.value : 'expense';
                const currentMonthStr = getLocalTodayString().slice(0, 7);

                // Popula o select de meses dinamicamente se estiver vazio
                if (monthFilterEl && monthFilterEl.options.length === 0) {
                    const monthsSet = new Set();
                    const [anoAtual, mesAtual] = currentMonthStr.split('-').map(Number);
                    for (let ano = 2026; ano <= anoAtual; ano++) {
                        const limiteMes = (ano === anoAtual) ? mesAtual : 12;
                        for (let mes = 1; mes <= limiteMes; mes++) monthsSet.add(`${ano}-${String(mes).padStart(2, '0')}`);
                    }
                    DB.state.transactions.forEach(t => {
                        if (t.date) {
                            const parts = t.date.split('/');
                            if (parts.length === 3) monthsSet.add(`${parts[2]}-${parts[1]}`);
                        }
                    });
                    const sortedMonths = Array.from(monthsSet).sort().reverse();

                    monthFilterEl.innerHTML = '<option value="all">Mês: Todos</option>';
                    sortedMonths.forEach(m => {
                        const [year, month] = m.split('-');
                        const opt = document.createElement('option');
                        opt.value = m;
                        opt.innerText = `${month}/${year}`;
                        if (m === currentMonthStr) opt.selected = true; // Deixa o mês atual selecionado por padrão
                        monthFilterEl.appendChild(opt);
                    });
                }

                const targetMonth = monthFilterEl ? monthFilterEl.value : currentMonthStr;

                const mapData = {};
                let totalValue = 0; // Guardará o valor total para mostrar no título

                DB.state.transactions.forEach(t => {
                    if (t.type === type) {
                        const transMonth = t.date.split('/').reverse().slice(0, 2).join('-');
                        // Soma apenas se for do mês selecionado ou se o filtro for "Todos"
                        if (targetMonth === 'all' || transMonth === targetMonth) {
                            const cat = t.cat || 'Outros';
                            mapData[cat] = (mapData[cat] || 0) + t.val;
                            totalValue += t.val; // Incrementa o total
                        }
                    }
                });

                // Exibe o Valor Total no cabeçalho do cartão (Sem a barra " | ")
                const totalLabel = document.getElementById('cat-pie-total-label');
                if (totalLabel) {
                    const formatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue);
                    totalLabel.style.color = type === 'income' ? 'var(--color-success)' : 'var(--color-danger)';
                    totalLabel.innerText = formatado;
                }

                const labels = Object.keys(mapData);
                const values = Object.values(mapData);

                let bgColors;
                if (values.length === 0) {
                    labels.push('Sem dados'); values.push(1); bgColors = ['#222'];
                } else {
                    bgColors = labels.map(l => this.catColors[l] || '#555');
                }

                // CORREÇÃO: O ERRO ESTAVA AQUI! Destruindo e criando o gráfico certo agora (catPie).
                if (this.instances.catPie) this.instances.catPie.destroy();

                this.instances.catPie = new Chart(ctx, {
                    type: 'doughnut',
                    plugins: (typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : []),
                    data: {
                        labels,
                        datasets: [{
                            data: values,
                            backgroundColor: bgColors,
                            borderWidth: 0,
                            hoverOffset: 10
                        }]
                    },
                    options: {
                        ...this.commonOptions,
                        cutout: '50%', // Aumenta a espessura da massa da pizza para caber os números dentro
                        layout: {
                            // Como os números estão dentro, não precisamos mais de margens gigantes por fora!
                            padding: { top: 10, bottom: 10, left: 10, right: 10 }
                        },
                        plugins: {
                            datalabels: {
                                color: '#ffffff', // Cor branca para contrastar com as fatias
                                anchor: 'center', // Fixa EXATAMENTE no meio da fatia
                                align: 'center',
                                font: { weight: 'bold', size: 13, family: "'Inter', sans-serif" },
                                display: function (context) {
                                    const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    const value = context.dataset.data[context.dataIndex];
                                    if (total === 0 || value === 0 || context.chart.data.labels[0] === 'Sem dados') return false;

                                    const percent = Math.round((value / total) * 100);
                                    // SÓ MOSTRA O TEXTO SE A FATIA FOR MAIOR OU IGUAL A 5%
                                    return percent >= 5;
                                },
                                formatter: (value, context) => {
                                    const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    return Math.round((value / total) * 100) + '%';
                                }
                            },
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: {
                                    color: '#eee',
                                    boxWidth: 10,
                                    padding: 15,
                                    usePointStyle: true,
                                    font: { size: 14, weight: 'bold', family: "'Inter', sans-serif" }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        let label = context.label || '';
                                        if (label) label += ': ';
                                        if (context.parsed !== null && context.chart.data.labels[0] !== 'Sem dados') {
                                            label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed);
                                        }
                                        return label;
                                    }
                                }
                            }
                        }
                    }
                });
            },

            // --- 2. GRÁFICO DE DISTRIBUIÇÃO (BANCOS) ---
            renderDist() {
                const ctx = document.getElementById('distChart'); if (!ctx) return;

                const labels = DB.state.banks.map(b => {
                    const n = (b.name || '').toLowerCase();
                    if (n.includes('caixa')) return 'Caixa';
                    if (n.includes('itau') || n.includes('itaú')) return 'Itaú';
                    if (n.includes('btg')) return 'BTG Pactual';
                    return b.name.substring(0, 12);
                });

                const values = DB.state.banks.map(b => b.balance);
                const colors = DB.state.banks.map(b => {
                    const n = (b.name || '').toLowerCase();
                    if (n.includes('itaú') || n.includes('itau')) return '#ec7000';
                    if (n.includes('btg')) return '#00295F';
                    if (n.includes('caixa')) return '#005ca9';
                    return '#333';
                });

                if (this.instances.dist) this.instances.dist.destroy();

                this.instances.dist = new Chart(ctx, {
                    type: 'doughnut',
                    plugins: (typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : []),
                    data: {
                        labels,
                        datasets: [{
                            data: values.length ? values : [1],
                            backgroundColor: values.length ? colors : ['#333'],
                            borderWidth: 0,
                            hoverOffset: 10
                        }]
                    },
                    options: {
                        ...this.commonOptions,
                        cutout: '50%',
                        layout: {
                            padding: { top: 10, bottom: 10, left: 10, right: 10 }
                        },
                        plugins: {
                            datalabels: {
                                color: '#ffffff',
                                anchor: 'center',
                                align: 'center',
                                font: { weight: 'bold', size: 13, family: "'Inter', sans-serif" },
                                display: function (context) {
                                    const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    const value = context.dataset.data[context.dataIndex];
                                    if (total === 0 || value === 0 || context.chart.data.labels[0] === 'Sem dados') return false;

                                    const percent = Math.round((value / total) * 100);
                                    // Esconde o texto se a fatia for menor que 5% (mas a fatia continua lá visível!)
                                    return percent >= 5;
                                },
                                formatter: (value, context) => {
                                    const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                    return Math.round((value / total) * 100) + '%';
                                }
                            },
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: {
                                    color: '#eee',
                                    boxWidth: 10,
                                    padding: 15,
                                    usePointStyle: true,
                                    font: { size: 14, weight: 'bold', family: "'Inter', sans-serif" }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        let label = context.label || '';
                                        if (label) label += ': ';
                                        if (context.parsed !== null && context.chart.data.labels[0] !== 'Sem dados') {
                                            label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed);
                                        }
                                        return label;
                                    }
                                }
                            }
                        }
                    }
                });
            },

            // --- 3. HELPER PARA TAR EFAS/HÁBITOS ---
            renderDoughnut(ctx, instanceName, done, missed, pending) {
                const total = done + missed + pending;
                const dataValues = total > 0 ? [done, missed, pending] : [0, 0, 1];
                const bgColors = total > 0 ? ['#10b981', '#ef4444', '#333'] : ['#333', '#333', '#333'];

                if (this.instances[instanceName]) this.instances[instanceName].destroy();

                this.instances[instanceName] = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Feito', 'Atrasado', 'Pendente'],
                        datasets: [{
                            data: dataValues,
                            backgroundColor: bgColors,
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        ...this.commonOptions,
                        cutout: '60%',
                        layout: { padding: 10 },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: { color: '#ccc', boxWidth: 15, padding: 20, usePointStyle: true, font: { size: 14.5, weight: 'bold', family: "'Inter', sans-serif" } }
                            }
                        }
                    }
                });
            },

            renderRadar() {
                const ctx = document.getElementById('radarChart'); if (!ctx) return;

                const todayObj = new Date();
                todayObj.setHours(0, 0, 0, 0);
                const todayStr = getLocalTodayString(todayObj);

                // 1. TAREFAS (Geral / Histórico Completo)
                const tasksTotal = DB.state.tasks.length || 1;
                const tasksDone = DB.state.tasks.filter(t => t.done).length;
                const taskScore = Math.min(100, Math.round((tasksDone / tasksTotal) * 100));

                let habDone = 0, habTotal = 0;
                let studyDone = 0, studyTotal = 0;
                let focoTotal = 0, focoDone = 0;

                // 2. FOCO BASEADO EM TAREFAS ATÉ HOJE
                DB.state.tasks.forEach(t => {
                    if (!t.date || t.date <= todayStr) {
                        focoTotal++;
                        if (t.done) focoDone++;
                    }
                });

                const libTitles = DB.state.library.map(l => (l.title || '').toLowerCase().trim()).filter(t => t.length > 0);
                const dataBaseA = new Date(2026, 1, 21);
                dataBaseA.setHours(0, 0, 0, 0);

                // 3. HÁBITOS E ESTUDO
                DB.state.habits.forEach(h => {
                    if (h.completed) return;

                    const habitName = (h.txt || '').toLowerCase();
                    const isStudyHabit = libTitles.some(title => habitName.includes(title)) || habitName.includes('estudar') || habitName.includes('curso') || habitName.includes('ler') || habitName.includes('duolingo');
                    const checks = h.checks || {};
                    const hFreq = h.freq || 'Diário';

                    let habitStartDate = new Date(2026, 0, 24);
                    if (h.createdAt) {
                        const parts = h.createdAt.split('-');
                        if (parts.length === 3) habitStartDate = new Date(parts[0], parts[1] - 1, parts[2]);
                    }
                    habitStartDate.setHours(0, 0, 0, 0);

                    Object.keys(checks).forEach(dateStr => {
                        const p = dateStr.split('-');
                        if (p.length === 3) {
                            const checkD = new Date(p[0], p[1] - 1, p[2]);
                            checkD.setHours(0, 0, 0, 0);
                            if (checkD < habitStartDate) habitStartDate = checkD;
                        }
                    });

                    let activeDays = (h.activeDays && Array.isArray(h.activeDays)) ? h.activeDays.map(Number) : [];
                    if (activeDays.length === 0) {
                        if (hFreq === 'Dias Úteis') activeDays = [1, 2, 3, 4, 5];
                        else if (['Semanal', 'FDS A', 'FDS B'].includes(hFreq)) activeDays = [0, 6];
                        else activeDays = [0, 1, 2, 3, 4, 5, 6];
                    }

                    let timeDiffHabit = todayObj.getTime() - habitStartDate.getTime();
                    let daysSinceHabitStart = Math.max(0, Math.round(timeDiffHabit / 86400000));

                    let expectedCount = 0;
                    let actualDoneCount = 0;

                    if (['Mensal', 'Quinzenal'].includes(hFreq)) {
                        let periods = hFreq === 'Mensal' ? Math.floor(daysSinceHabitStart / 30) + 1 : Math.floor(daysSinceHabitStart / 15) + 1;
                        expectedCount = periods;
                        actualDoneCount = Object.keys(checks).length;
                        if (actualDoneCount > expectedCount) expectedCount = actualDoneCount;
                    } else {
                        for (let i = 0; i <= daysSinceHabitStart; i++) {
                            const d = new Date(habitStartDate);
                            d.setDate(d.getDate() + i);

                            const isChecked = !!checks[getLocalTodayString(d)];
                            const shouldDoInLoop = HabitModule.isRequiredForDate(h, d);

                            if (shouldDoInLoop || isChecked) expectedCount++;
                            if (isChecked) actualDoneCount++;
                        }
                    }

                    habTotal += expectedCount;
                    habDone += actualDoneCount;
                    focoTotal += expectedCount;
                    focoDone += actualDoneCount;

                    if (isStudyHabit) {
                        studyTotal += expectedCount;
                        studyDone += actualDoneCount;
                    }
                });

                const habitScore = habTotal > 0 ? Math.min(100, Math.round((habDone / habTotal) * 100)) : 0;
                const studyScore = studyTotal > 0 ? Math.min(100, Math.round((studyDone / studyTotal) * 100)) : habitScore;
                const focoScore = focoTotal > 0 ? Math.min(100, Math.round((focoDone / focoTotal) * 100)) : 0;

                // 4. FINANÇAS
                let inc = 0, exp = 0;
                DB.state.transactions.forEach(t => {
                    if (t.type === 'income') inc += t.val; else exp += t.val;
                });
                let finScore = 50;
                if (inc > 0 || exp > 0) finScore = Math.min(100, Math.round((inc / (inc + exp)) * 100));

                // MÉDIA GERAL
                const avgScore = Math.round((taskScore + habitScore + finScore + studyScore + focoScore) / 5);

                // --- INJETA O VALOR DO SCORE NO CABEÇALHO DO CARTÃO ---
                const scoreLabel = document.getElementById('radar-total-score');
                if (scoreLabel) {
                    scoreLabel.innerHTML = `<span style="font-size: 0.75rem; color: #888; font-family: 'Inter', sans-serif; font-weight: 700; margin-right: 5px;">SCORE:</span>${avgScore}`;
                }

                const data = {
                    labels: ['Tarefas', 'Hábitos', 'Finanças', 'Estudo', 'Foco'],
                    datasets: [{
                        label: 'Nível',
                        data: [taskScore, habitScore, finScore, studyScore, focoScore],
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        borderColor: '#ef4444',
                        borderWidth: 1.5,
                        pointBackgroundColor: '#ef4444',
                        pointRadius: 4,
                        pointHitRadius: 40,
                        pointHoverRadius: 6
                    }]
                };

                if (this.instances.radar) this.instances.radar.destroy();

                // Cria o gráfico sem o plugin de texto no meio e sem eventos de clique
                this.instances.radar = new Chart(ctx, {
                    type: 'radar',
                    data,
                    options: {
                        ...this.commonOptions,
                        layout: { padding: 10 },
                        scales: {
                            r: {
                                min: 0,
                                max: 100,
                                grid: { color: 'rgba(255,255,255,0.1)' },
                                angleLines: { color: 'rgba(255,255,255,0.1)' },
                                ticks: { display: false, stepSize: 20 },
                                pointLabels: { color: '#ccc', font: { size: 12, family: "'Inter', sans-serif", weight: '600' }, padding: 15 }
                            }
                        },
                        plugins: {
                            tooltip: { padding: 12, bodyFont: { size: 14, weight: 'bold' }, titleFont: { size: 13 }, backgroundColor: 'rgba(0, 0, 0, 0.85)', displayColors: false },
                            legend: { display: false }
                        },
                        interaction: {
                            mode: 'nearest',
                            intersect: true,
                            axis: 'xy'
                        }
                    }
                });
            },

            renderFlow() {
                const ctx = document.getElementById('flowChart'); if (!ctx) return;

                // NOVO: Pega o valor do filtro (mês escolhido) ou usa o mês atual como padrão
                const monthFilterEl = document.getElementById('flow-month-filter');
                const targetMonth = (monthFilterEl && monthFilterEl.value) ? monthFilterEl.value : getLocalTodayString().slice(0, 7);

                let income = 0, expense = 0;

                DB.state.transactions.forEach(t => {
                    // Pega a data salva (DD/MM/YYYY) e converte para conferir se bate com o mês selecionado
                    if ((t.date || '').split('/').reverse().join('-').startsWith(targetMonth)) {
                        if (t.type === 'income') income += t.val; else expense += t.val;
                    }
                });

                if (this.instances.flow) this.instances.flow.destroy();
                this.instances.flow = new Chart(ctx, {
                    type: 'bar',
                    data: { labels: ['Entradas', 'Saídas'], datasets: [{ data: [income, expense], backgroundColor: ['#10b981', '#ef4444'], borderRadius: 6, barThickness: 40 }] },
                    options: {
                        ...this.commonOptions,
                        plugins: { legend: { display: false }, tooltip: { animation: { duration: 200 }, padding: 12, bodyFont: { size: 14, weight: 'bold' }, titleFont: { size: 13 }, backgroundColor: 'rgba(0, 0, 0, 0.85)', displayColors: false } },
                        interaction: { mode: 'nearest', intersect: true, axis: 'xy' },
                        onClick: (event, elements, chart) => this.handleChartClick(event, elements, chart),
                        scales: { y: { beginAtZero: true, grid: { color: '#222' }, ticks: { color: '#666' } }, x: { grid: { display: false }, ticks: { color: '#fff' } } }
                    }
                });
            },

            // =================================================================
            // FUNÇÕES GAMIFICADAS (GRÁFICOS DE LINHA TEMPORAL INTELIGENTES)
            // =================================================================

            // Pega as datas dos últimos N dias no formato YYYY-MM-DD
            getLastNDaysDates(n) {
                const dates = [];
                for (let i = n - 1; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    dates.push(getLocalTodayString(d));
                }
                return dates;
            },

            // Renderizador universal para os gráficos de linha (Estilo Jogo)
            renderGameLineChart(ctxId, instanceName, labels, dataPoints, colorHex) {
                const ctx = document.getElementById(ctxId); if (!ctx) return;
                const canvasCtx = ctx.getContext('2d');

                if (this.instances[instanceName]) this.instances[instanceName].destroy();

                // Cria um gradiente brilhante para a linha (Efeito Neon)
                let gradient = canvasCtx.createLinearGradient(0, 0, 0, 300);
                gradient.addColorStop(0, colorHex + '66'); // ~40% opacidade
                gradient.addColorStop(1, colorHex + '00'); // Transparente no fundo

                this.instances[instanceName] = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Desempenho Diário (%)',
                            data: dataPoints,
                            borderColor: colorHex,
                            backgroundColor: gradient,
                            borderWidth: 3,
                            pointBackgroundColor: '#050505',
                            pointBorderColor: colorHex,
                            pointBorderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 7,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        ...this.commonOptions,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                animation: { duration: 200 }, padding: 12, bodyFont: { size: 14, weight: 'bold' },
                                backgroundColor: 'rgba(0,0,0,0.9)', displayColors: false,
                                callbacks: {
                                    label: function (context) { return `Concluído: ${context.parsed.y}%`; }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true, max: 100,
                                grid: { color: 'rgba(255,255,255,0.05)' },
                                ticks: { color: '#666', stepSize: 25, callback: function (value) { return value + "%" } }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: '#888', maxTicksLimit: 7 }
                            }
                        },
                        interaction: { mode: 'index', intersect: false }
                    }
                });
            },

            // --- CALCULA A EVOLUÇÃO DAS TAREFAS BASEADA NO FILTRO DO BACKLOG ---
            renderTaskPerformance() {
                const ctx = document.getElementById('taskPerformanceChart'); if (!ctx) return;
                const timeSelect = document.getElementById('task-chart-time');
                const daysToLookBack = timeSelect ? parseInt(timeSelect.value) : 7;

                const mainFilter = document.getElementById('task-view-filter') ? document.getElementById('task-view-filter').value : 'all';
                const dateStrs = this.getLastNDaysDates(daysToLookBack);

                const labels = [];
                const dataPoints = [];

                // 1. Pré-filtra as tarefas de acordo com a prioridade selecionada na tela
                let tasksToEvaluate = DB.state.tasks;
                if (mainFilter === 'high') {
                    tasksToEvaluate = tasksToEvaluate.filter(t => t.prio === 'HIGH');
                } else if (mainFilter === 'low') {
                    tasksToEvaluate = tasksToEvaluate.filter(t => t.prio === 'LOW');
                }

                // 2. Calcula a "fotografia" do seu progresso dia a dia
                dateStrs.forEach(targetDate => {
                    // CORREÇÃO DEFINITIVA: 
                    // Sem "if/else". O gráfico agora cruza os dados olhando ESTRITAMENTE para 
                    // o dia correspondente. Ignorando as perdidas do passado e as sem data.
                    const targetTasks = tasksToEvaluate.filter(t => t.date === targetDate);

                    const total = targetTasks.length;
                    const done = targetTasks.filter(t => t.done).length;

                    if (total > 0) {
                        labels.push(targetDate.split('-').reverse().slice(0, 2).join('/'));
                        dataPoints.push(Math.round((done / total) * 100));
                    } else {
                        // Para a linha não sumir nos dias em que você tirou folga (0 tarefas)
                        labels.push(targetDate.split('-').reverse().slice(0, 2).join('/'));
                        dataPoints.push(0);
                    }
                });

                if (labels.length === 0) {
                    labels.push('Sem dados');
                    dataPoints.push(0);
                }

                this.renderGameLineChart('taskPerformanceChart', 'taskLine', labels, dataPoints, '#ef4444');
            },

            // --- CALCULA A EVOLUÇÃO DOS HÁBITOS (FLEXÍVEL) ---
            renderHabitPerformance() {
                const ctx = document.getElementById('habitPerformanceChart'); if (!ctx) return;
                const timeSelect = document.getElementById('habit-chart-time');
                const daysToLookBack = timeSelect ? parseInt(timeSelect.value) : 7;

                const mainFilter = document.getElementById('habit-view-filter') ? document.getElementById('habit-view-filter').value : 'hoje';
                const dateStrs = this.getLastNDaysDates(daysToLookBack);

                const labels = [];
                const dataPoints = [];

                const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
                const todayStr = getLocalTodayString(todayObj);
                const realTodayDayOfWeek = todayObj.getDay();
                const dataBaseA = new Date(2026, 1, 21); dataBaseA.setHours(0, 0, 0, 0);

                const getSafeActiveDays = (h) => {
                    const freq = h.freq || 'Diário';
                    if (freq === 'Diário') return [0, 1, 2, 3, 4, 5, 6];
                    if (freq === 'Dias Úteis') return [1, 2, 3, 4, 5];
                    if (h.activeDays && Array.isArray(h.activeDays) && h.activeDays.length > 0) return h.activeDays.map(Number);
                    if (['Semanal', 'FDS A', 'FDS B'].includes(freq)) return [0, 6];
                    return [0, 1, 2, 3, 4, 5, 6];
                };

                let habitsToEvaluate = DB.state.habits.filter(h => !h.completed);

                if (mainFilter !== 'all' && mainFilter !== 'hoje') {
                    habitsToEvaluate = habitsToEvaluate.filter(h => (h.freq || 'Diário') === mainFilter);
                }

                dateStrs.forEach(targetDate => {
                    const parts = targetDate.split('-');
                    const dObj = new Date(parts[0], parts[1] - 1, parts[2]); dObj.setHours(0, 0, 0, 0);
                    const targetDayOfWeek = dObj.getDay();
                    const targetMonthStr = targetDate.slice(0, 7);

                    let expectedCount = 0;
                    let doneCount = 0;

                    habitsToEvaluate.forEach(h => {
                        const hFreq = h.freq || 'Diário';
                        const checks = h.checks || {};

                        let habitStartDate = new Date(2026, 0, 24);
                        if (h.createdAt) {
                            const cp = h.createdAt.split('-');
                            if (cp.length === 3) habitStartDate = new Date(cp[0], cp[1] - 1, cp[2]);
                        }
                        habitStartDate.setHours(0, 0, 0, 0);

                        if (dObj < habitStartDate) return;

                        const isChecked = !!checks[targetDate];
                        let shouldDoToday = HabitModule.isRequiredForDate(h, dObj);
                        if (shouldDoToday || isChecked) {
                            expectedCount++;
                            if (isChecked) doneCount++;
                        }
                    });

                    labels.push(targetDate.split('-').reverse().slice(0, 2).join('/'));
                    if (expectedCount > 0) {
                        dataPoints.push(Math.round((doneCount / expectedCount) * 100));
                    } else if (mainFilter === 'all' || mainFilter === 'hoje') {
                        dataPoints.push(0);
                    }
                });

                if (labels.length === 0) {
                    labels.push('Sem dados');
                    dataPoints.push(0);
                }

                this.renderGameLineChart('habitPerformanceChart', 'habitLine', labels, dataPoints, '#10b981');
            },

            renderLibraryPerformance() { }
        };

        // --- NOVO: MÓDULO DE OFENSIVA (STREAK) GAMIFICADA ---
        const StreakModule = {
            calculateStreak() {
                const todayObj = new Date();
                let currentStreak = 0;
                let checkingDate = new Date(todayObj);

                // Volta no tempo dia por dia checando se fez ao menos 1 hábito
                while (true) {
                    const dateStr = getLocalTodayString(checkingDate);
                    const completedAny = DB.state.habits.some(h => h.checks && h.checks[dateStr]);

                    if (completedAny) {
                        currentStreak++;
                        checkingDate.setDate(checkingDate.getDate() - 1);
                    } else {
                        // Tolera se não fez hoje ainda, mas ontem sim
                        if (currentStreak === 0 && getLocalTodayString(checkingDate) === getLocalTodayString(new Date())) {
                            checkingDate.setDate(checkingDate.getDate() - 1);
                        } else {
                            break;
                        }
                    }
                }
                return currentStreak;
            },

            renderWeek() {
                const container = document.getElementById('streak-week-days');
                if (!container) return;
                container.innerHTML = '';

                const todayObj = new Date();
                let dayOfWeek = todayObj.getDay();
                const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

                const mondayDate = new Date(todayObj);
                mondayDate.setDate(todayObj.getDate() - diffToMonday);

                const daysNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
                let lastDoneIndex = -1; // Usado para a matemática perfeita da linha

                for (let i = 0; i < 7; i++) {
                    const currentDay = new Date(mondayDate);
                    currentDay.setDate(mondayDate.getDate() + i);
                    const dateStr = getLocalTodayString(currentDay);

                    const isFuture = currentDay > todayObj;
                    const completedAny = DB.state.habits.some(h => h.checks && h.checks[dateStr]);
                    const isToday = getLocalTodayString(currentDay) === getLocalTodayString(todayObj);

                    // Grava qual foi o último dia que o usuário completou na semana
                    if (completedAny && (!isFuture || isToday)) lastDoneIndex = i;

                    let circleClass = 'streak-day-circle';
                    let iconHTML = '';
                    let labelColor = '#666';

                    if (completedAny) {
                        circleClass += ' done';
                        iconHTML = '<i class="fas fa-check"></i>';
                        labelColor = '#fff';
                    } else if (isToday) {
                        circleClass += ' today-pending';
                        labelColor = '#fff';
                    }

                    container.innerHTML += `
                    <div class="streak-day-col">
                        <span class="streak-day-label" style="color: ${labelColor}">${daysNames[i]}</span>
                        <div class="${circleClass}">
                            ${iconHTML}
                        </div>
                    </div>
                `;
                }

                // Animação e tamanho exato da barra de fundo
                setTimeout(() => {
                    const bar = document.getElementById('streak-connection-bar');
                    if (bar) {
                        if (lastDoneIndex > 0) {
                            // Calcula o espaço exato entre as bolinhas (0 a 6 intervalos)
                            bar.style.width = `calc(${(lastDoneIndex / 6) * 100}%)`;
                        } else {
                            // Se só fez 1 dia ou 0 dias, a linha não cresce (ela fica atrás da bolinha)
                            bar.style.width = '0%';
                        }
                    }
                }, 50);
            },

            updateUI() {
                const streak = this.calculateStreak();

                // Atualiza o foguinho pequeno lá no Header
                const headerCount = document.getElementById('header-streak-count');
                if (headerCount) headerCount.innerText = streak;

                // Atualiza o foguinho gigante do Pop-up
                const bigNumber = document.getElementById('streak-big-number');
                if (bigNumber) bigNumber.innerText = streak;

                this.renderWeek();
            },

            openModal() {
                this.updateUI();
                document.getElementById('streak-modal').classList.add('active');
            },

            closeModal() {
                document.getElementById('streak-modal').classList.remove('active');
            }
        };

        window.addEventListener('DOMContentLoaded', () => System.init());

        // --- 9. MOBILE ANIMATION FIX (FORÇA FEEDBACK TÁTIL APENAS QUANDO NÃO ROLA) ---
        let touchMoved = false;
        document.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
        document.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });

        // Adiciona animação manual ao clicar nos botões do mobile
        document.querySelectorAll('.mob-link').forEach(btn => {
            btn.addEventListener('click', function (e) {
                // Remove a classe 'animate-click' de todos
                document.querySelectorAll('.mob-link').forEach(b => b.classList.remove('animate-click'));

                // Adiciona na atual para disparar a animação
                this.classList.add('animate-click');

                // Remove depois de 300ms para poder clicar de novo
                setTimeout(() => {
                    this.classList.remove('animate-click');
                }, 300);
            });
        });
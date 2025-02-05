const { menuPagamento, formasPagamento } = require('./menus');
const moment = require('moment-timezone');

const userLastActivity = new Map();

const userInitialContact = new Map();

const INACTIVITY_TIMEOUT = 12 * 60 * 60 * 1000;

const NEW_USER_GRACE_PERIOD = 30 * 60 * 1000;

function updateUserActivity(userId) {
    userLastActivity.set(userId, Date.now());
    
    if (!userInitialContact.has(userId)) {
        userInitialContact.set(userId, Date.now());
    }
}

function hasUserTimedOut(userId) {
    const lastActivity = userLastActivity.get(userId);
    const initialContact = userInitialContact.get(userId);
    const currentTime = Date.now();
    
    if (!lastActivity || !initialContact) {
        return false;
    }
    
    if ((currentTime - initialContact) < NEW_USER_GRACE_PERIOD) {
        return false;
    }
    
    const inactiveTime = currentTime - lastActivity;
    return inactiveTime >= INACTIVITY_TIMEOUT;
}

function resetUserState(userId, orderData) {
    userLastActivity.delete(userId);
    
    if (orderData[userId]) {
        const wasActive = orderData[userId].botActive;
        delete orderData[userId];
        
        orderData[userId] = {
            estado: 'INICIAL',
            botActive: wasActive,
            lastReset: Date.now()
        };
    }
    
    return orderData[userId];
}

function handleInactivityTimeout(userId, orderData) {
    if (!orderData[userId]) {
        orderData[userId] = {
            estado: 'INICIAL',
            botActive: true,
            firstContact: Date.now()
        };
        updateUserActivity(userId);
        return orderData[userId];
    }
    
    if (hasUserTimedOut(userId)) {
        console.log(`User ${userId} timed out due to inactivity`);
        return resetUserState(userId, orderData);
    }
    
    return orderData[userId];
}

function isDentroHorarioAtendimento() {
    const hora = moment().tz('America/Sao_Paulo').hour();
    return hora >= 8 && hora < 20;
}

function getAtendenteDisponivel(atendentes) {
    const hora = moment().tz('America/Sao_Paulo').hour();

    for (const atendente of Object.values(atendentes)) {
        if (hora >= atendente.horarioInicio && hora < atendente.horarioFim) {
            return atendente;
        }
    }
    return null;
}

function getSaudacao() {
    const hora = moment().tz('America/Sao_Paulo').hour();
    if (hora >= 5 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
}

async function sendMessageWithTyping(client, to, message) {
    const chat = await client.getChatById(to);
    await chat.sendStateTyping();

    const typingTime = Math.min(Math.max((message.length / 100) * 1000, 1000), 4000);
    await new Promise(resolve => setTimeout(resolve, typingTime));

    await client.sendMessage(to, message);
    await new Promise(resolve => setTimeout(resolve, 1000));
}

function getFormattedName(pushname) {
    if (!pushname) {
        return '';
    }

    const cleanName = pushname.trim().replace(/\s+/g, ' ');

    if (cleanName === '') {
        return '';
    }

    const nameParts = cleanName.split(' ');
    return nameParts[0];
}

function generateGreeting(pushname) {
    const saudacao = getSaudacao();
    const formattedName = getFormattedName(pushname);

    if (!formattedName) {
        return `${saudacao}!`;
    }

    return `${saudacao}, ${formattedName}!`;
}

function getUserId(msg) {
    return msg.from.replace('@c.us', '');
}

const BotState = {
    orderData: {},

    setState(userId, updates) {
        this.orderData[userId] = {
            ...this.orderData[userId],
            ...updates
        };
    },

    getState(userId) {
        return this.orderData[userId] || {};
    },

    validateStateTransition(currentState, newState) {
        const validTransitions = {
            'INICIAL': ['AGUARDANDO_ESCOLHA_CATEGORIA'],
            'AGUARDANDO_ESCOLHA_CATEGORIA': ['AGUARDANDO_ESCOLHA_SUBCATEGORIA', 'AGUARDANDO_CONFIRMACAO_PRODUTO'],
            'AGUARDANDO_FORMA_PAGAMENTO': ['CONFIRMACAO_PEDIDO'],
        };

        return validTransitions[currentState]?.includes(newState) || false;
    }
};

class PaymentProcessor {
    static validatePaymentOption(input) {
        const validOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        return validOptions.includes(input);
    }

    static async handlePaymentSelection(msg, orderData, client) {
        const paymentOption = msg.body;

        if (!this.validatePaymentOption(paymentOption)) {
            await sendMessageWithTyping(client, msg.from,
                "❌ Opção de pagamento inválida. Por favor, escolha uma das opções abaixo:");
            await sendMessageWithTyping(client, msg.from, menuPagamento);
            return false;
        }

        orderData[msg.from].formaPagamento = formasPagamento[paymentOption];
        return true;
    }
}

class DataCollectionManager {
    static async handlePersonalDataCollection(msg, orderData, client) {
        try {
            const newState = await coletarDadosPessoais(msg);

            if (newState === 'AGUARDANDO_FORMA_PAGAMENTO') {
                await this.ensurePaymentStep(msg, orderData, client);
            }

            return newState;
        } catch (error) {
            console.error('Error in personal data collection:', error);
            throw error;
        }
    }

    static async ensurePaymentStep(msg, orderData, client) {
        if (!orderData[msg.from].formaPagamento) {
            await sendMessageWithTyping(client, msg.from, menuPagamento);
            orderData[msg.from].estado = 'AGUARDANDO_FORMA_PAGAMENTO';
            return true;
        }
        return false;
    }

    static async validateAndUpdateAddress(msg, orderData) {
        const address = orderData[msg.from].endereco;
        const requiredFields = {
            casa: ['tipo', 'rua', 'numero', 'cep', 'referencia'],
            apartamento: ['tipo', 'rua', 'numeroCondominio', 'nomeCondominio', 'bloco', 'apartamento', 'cep']
        };

        const type = address?.tipo;
        if (!type || !requiredFields[type]) {
            return false;
        }

        return requiredFields[type].every(field => address[field]);
    }
}

class ErrorHandler {
    static async handleError(error, msg, client, orderData) {
        console.error('Bot Error:', {
            error: error.message,
            stack: error.stack,
            userId: msg.from,
            currentState: orderData[msg.from]?.estado
        });

        try {
            if (orderData[msg.from]) {
                const previousState = orderData[msg.from].estado;
                await this.recoverState(msg, client, previousState);
            } else {
                await sendMessageWithTyping(client, msg.from,
                    "Desculpe, ocorreu um erro. Vamos recomeçar o processo?\n" +
                    "Digite 'novo pedido' para iniciar novamente.");
            }
        } catch (recoveryError) {
            console.error('Error recovery failed:', recoveryError);
            await this.sendFallbackMessage(msg, client);
        }
    }

    static async recoverState(msg, client, previousState) {
        const stateRecoveryMessages = {
            'AGUARDANDO_FORMA_PAGAMENTO': {
                message: "Vamos continuar com a forma de pagamento. Por favor, escolha uma opção:",
                menu: menuPagamento
            },
            'AGUARDANDO_DADOS_PESSOAIS': {
                message: "Vamos retomar seus dados pessoais. Por favor, confirme:",
                menu: null
            }
        };

        const recovery = stateRecoveryMessages[previousState];
        if (recovery) {
            await sendMessageWithTyping(client, msg.from, recovery.message);
            if (recovery.menu) {
                await sendMessageWithTyping(client, msg.from, recovery.menu);
            }
        }
    }

    static async sendFallbackMessage(msg, client) {
        await sendMessageWithTyping(client, msg.from,
            "Desculpe, não foi possível recuperar o estado anterior. " +
            "Por favor, digite 'novo pedido' para recomeçar.");
    }
}

function validateInputForState(input, state) {
    const validators = {
        'AGUARDANDO_FORMA_PAGAMENTO': (input) => {
            return PaymentProcessor.validatePaymentOption(input);
        },
        'CONFIRMACAO_PEDIDO': (input) => {
            return ['1', '2'].includes(input);
        }
    };

    return validators[state] ? validators[state](input) : true;
}

async function handleInvalidInput(msg, client, state) {
    const errorMessages = {
        'AGUARDANDO_FORMA_PAGAMENTO': {
            message: "Por favor, escolha uma forma de pagamento válida:",
            menu: menuPagamento
        },
        'CONFIRMACAO_PEDIDO': {
            message: "Por favor, escolha uma opção válida:\n1 - Confirmar\n2 - Corrigir"
        }
    };

    const error = errorMessages[state];
    if (error) {
        await sendMessageWithTyping(client, msg.from, error.message);
        if (error.menu) {
            await sendMessageWithTyping(client, msg.from, error.menu);
        }
    }
}

function formatarNumeroTelefone(numero) {
    let numeroLimpo = numero.replace(/\D/g, '');
    
    if (numeroLimpo.startsWith('55') && numeroLimpo.length >= 12) {
        numeroLimpo = numeroLimpo.substring(2);
    }
    
    if (numeroLimpo.length < 10 || numeroLimpo.length > 11) {
        console.log('Número inválido:', numero);
        return numero;
    }
    
    const ddd = numeroLimpo.substring(0, 2);
    
    let restante = numeroLimpo.substring(2);
    
    if (restante.length === 8) {
        restante = '9' + restante;
    }
    
    const parte1 = restante.substring(0, 5);
    const parte2 = restante.substring(5);
    
    return `(${ddd}) ${parte1}-${parte2}`;
}

module.exports = {
    isDentroHorarioAtendimento,
    getAtendenteDisponivel,
    getSaudacao,
    sendMessageWithTyping,
    getFormattedName,
    generateGreeting,
    getUserId,
    updateUserActivity,
    hasUserTimedOut,
    resetUserState,
    handleInactivityTimeout,
    handleInvalidInput,
    validateInputForState,
    ErrorHandler,
    DataCollectionManager,
    PaymentProcessor,
    BotState,
    formatarNumeroTelefone
};
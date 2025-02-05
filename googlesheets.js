const { google } = require('googleapis');
const moment = require('moment-timezone');
const { atendentes } = require('./atendentes');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = './credentials.json';
const SPREADSHEET_ID = 'SEU_TOKEN';

// Create auth client
const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SCOPES,
});

let sheetsApi = null;

// Initialize Google Sheets API
async function initializeSheetsApi() {
    try {
        const client = await auth.getClient();
        sheetsApi = google.sheets({ version: 'v4', auth: client });
        console.log('Google Sheets API initialized successfully');
    } catch (error) {
        console.error('Error initializing Google Sheets API:', error);
        throw error;
    }
}

/**
 * Determines which attendant is currently on duty based on the time
 * @returns {string} Name of the current attendant
 */
function getActiveAttendant() {
    const currentHour = moment().tz('America/Sao_Paulo').hour();
    
    for (const attendant of Object.values(atendentes)) {
        // Check if current hour falls within attendant's shift
        if (currentHour >= attendant.horarioInicio && currentHour < attendant.horarioFim) {
            return attendant.nome;
        }
    }
    
    // Return 'Não definido' if no attendant is scheduled for current hour
    return 'Fora de Horário';
}

/**
 * Format order data for Google Sheets
 * @param {Object} orderData - The order data from the bot
 * @returns {Array} Formatted row for Google Sheets
 */
function formatOrderData(orderData) {
    const timestamp = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
    const dadosPessoais = orderData.dadosPessoais || {};
    const endereco = orderData.endereco || {};

    // Format address based on type
    let enderecoFormatado = '';
    if (endereco.tipo === 'casa') {
        enderecoFormatado = `${endereco.rua}, ${endereco.numero} - CEP: ${endereco.cep}\nReferência: ${endereco.referencia}`;
    } else if (endereco.tipo === 'apartamento') {
        enderecoFormatado = `${endereco.rua}, ${endereco.numeroCondominio} - ${endereco.nomeCondominio}\nBloco: ${endereco.bloco}, Apto: ${endereco.apartamento}\nCEP: ${endereco.cep}`;
    }

    // Get the active attendant for the current time
    const atendenteResponsavel = getActiveAttendant();

    // Return array formatted for sheet columns
    return [
        timestamp,                    // Data/Hora
        dadosPessoais.nome || '',    // Nome
        dadosPessoais.telefone || '', // Telefone
        dadosPessoais.email || '',   // Email
        orderData.produto || '',      // Produto
        enderecoFormatado,           // Endereço Completo
        endereco.tipo || '',         // Tipo de Endereço
        orderData.formaPagamento || '', // Forma de Pagamento
        'Novo',                      // Status do Pedido
        atendenteResponsavel         // Atendente Responsável
    ];
}

/**
 * Add a new order to Google Sheets
 * @param {Object} orderData - The complete order data
 * @returns {Promise<Object>} Result of the operation
 */
async function addOrderToSheet(orderData) {
    try {
        if (!sheetsApi) {
            await initializeSheetsApi();
        }

        const formattedData = formatOrderData(orderData);

        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: 'Pedidos!A:J', // Updated range to include the attendant column
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [formattedData],
            },
        };

        const response = await sheetsApi.spreadsheets.values.append(request);
        
        console.log('Order added to Google Sheets:', response.data);
        return {
            success: true,
            rowNumber: response.data.updates.updatedRange,
        };
    } catch (error) {
        console.error('Error adding order to Google Sheets:', error);
        throw error;
    }
}

/**
 * Update order status in Google Sheets
 * @param {string} rowNumber - The row number to update
 * @param {string} newStatus - The new status to set
 */
async function updateOrderStatus(rowNumber, newStatus) {
    try {
        if (!sheetsApi) {
            await initializeSheetsApi();
        }

        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: `Pedidos!I${rowNumber}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[newStatus]],
            },
        };

        await sheetsApi.spreadsheets.values.update(request);
        console.log(`Order status updated to ${newStatus} in row ${rowNumber}`);
    } catch (error) {
        console.error('Error updating order status:', error);
        throw error;
    }
}

module.exports = {
    initializeSheetsApi,
    addOrderToSheet,
    updateOrderStatus,
};
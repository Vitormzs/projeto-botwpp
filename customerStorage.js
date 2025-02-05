const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const STORAGE_FILE = path.join(__dirname, 'customer_data.json');

if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify({}));
}

function readCustomerData() {
    try {
        const data = fs.readFileSync(STORAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading customer data:', error);
        return {};
    }
}

function saveCustomerInfo(phoneNumber, customerInfo) {
    try {
        const data = readCustomerData();
        data[phoneNumber] = customerInfo;
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving customer info:', error);
    }
}

function getCustomerInfo(phoneNumber) {
    const data = readCustomerData();
    return data[phoneNumber] || null;
}

function generateResume(data, options = {}) {

    if (!data) {
        return "❌ Não foram encontrados dados para gerar o resumo.";
    }

    let resume = "";

    resume += options.includeOrderDetails
        ? "📋 *RESUMO DO PEDIDO*\n\n"
        : "📋 *DADOS SALVOS*\n\n";

    if (options.includeTimestamp) {
        const horaAtual = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
        resume += "*Data e Hora:* " + horaAtual + "\n\n";
    }

    if (data.dadosPessoais && Object.keys(data.dadosPessoais).length > 0) {
        resume += "*DADOS DO CLIENTE*\n";
        const { nome, telefone, email } = data.dadosPessoais;
        if (nome) resume += `Nome: ${nome}\n`;
        if (telefone) resume += `Telefone: ${telefone}\n`;
        if (email) resume += `Email: ${email}\n\n`;
    }

    if (options.includeOrderDetails) {
        if (data.produto) {
            resume += "*PRODUTO SELECIONADO*\n";
            resume += `${data.produto}\n\n`;
        }

        if (data.formaPagamento) {
            resume += "*FORMA DE PAGAMENTO*\n";
            resume += `${data.formaPagamento}\n\n`;
        }
    }

    if (data.endereco && Object.keys(data.endereco).length > 0) {
        resume += "*ENDEREÇO DE ENTREGA*\n";
        const endereco = data.endereco;

        if (endereco.tipo === 'casa') {
            resume += "Tipo: Casa\n";
            if (endereco.rua) resume += `Rua: ${endereco.rua}\n`;
            if (endereco.numero) resume += `Número: ${endereco.numero}\n`;
            if (endereco.cep) resume += `CEP: ${endereco.cep}\n`;
            if (endereco.referencia) resume += `Ponto de Referência: ${endereco.referencia}\n`;
        } else if (endereco.tipo === 'apartamento') {
            resume += "Tipo: Apartamento\n";
            if (endereco.rua) resume += `Rua: ${endereco.rua}\n`;
            if (endereco.numeroCondominio) resume += `Número do Condomínio: ${endereco.numeroCondominio}\n`;
            if (endereco.nomeCondominio) resume += `Nome do Condomínio: ${endereco.nomeCondominio}\n`;
            if (endereco.bloco) resume += `Bloco: ${endereco.bloco}\n`;
            if (endereco.apartamento) resume += `Apartamento: ${endereco.apartamento}\n`;
            if (endereco.cep) resume += `CEP: ${endereco.cep}\n`;
        }
    }

    return resume;
}

function formatSavedCustomerData(customerInfo) {
    return generateResume(customerInfo, {
        includeOrderDetails: false,
        includeTimestamp: false
    });
}

module.exports = {
    saveCustomerInfo,
    getCustomerInfo,
    generateResume,
    formatSavedCustomerData
};
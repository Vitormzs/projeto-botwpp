const { sendMessageWithTyping, formatarNumeroTelefone } = require('./functions');
const { menuPagamento } = require('./menus');
const { generateResume } = require('./customerStorage');

async function coletarDadosPessoais(msg, client, orderData) {
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const contact = await msg.getContact();
    const whatsappName = contact.pushname || '';
    const whatsappPhone = formatarNumeroTelefone(msg.from.replace('@c.us', ''));

    if (!orderData[msg.from]) {
        orderData[msg.from] = {};
    }

    const estado = orderData[msg.from].estadoDadosPessoais || 0;

    if (!orderData[msg.from].dadosPessoais) {
        orderData[msg.from].dadosPessoais = {};
    }

    switch (estado) {
        case 0:
            await sendMessageWithTyping(client, msg.from, `Notei que seu nome no WhatsApp é "${whatsappName}".`);
            await sendMessageWithTyping(client, msg.from,
                `Você quer:\n` +
                `1 - Usar este mesmo nome\n` +
                `2 - Informar outro nome (para ser entregue a pessoa certa)`
            );
            orderData[msg.from].estadoDadosPessoais = 1;
            return "AGUARDANDO_DADOS_PESSOAIS";

        case 1:
            if (msg.body === '1') {
                orderData[msg.from].dadosPessoais.nome = whatsappName;
                await sendMessageWithTyping(client, msg.from, `Notei que seu número é "${whatsappPhone}".`);
                await sendMessageWithTyping(client, msg.from,
                    `Você quer:\n` +
                    `1 - Usar este mesmo número para contato\n` +
                    `2 - Informar outro número`
                );
                orderData[msg.from].estadoDadosPessoais = 3;
            } else if (msg.body === '2') {
                await sendMessageWithTyping(client, msg.from, "Por favor, informe o nome completo:");
                orderData[msg.from].estadoDadosPessoais = 2;
            } else {
                await sendMessageWithTyping(client, msg.from, `❌ Opção inválida!`);
                await sendMessageWithTyping(client, msg.from,
                    `Por favor, escolha:\n` +
                    `1 - Usar o nome "${whatsappName}"\n` +
                    `2 - Informar outro nome`
                );
            }
            return "AGUARDANDO_DADOS_PESSOAIS";

        case 2:
            orderData[msg.from].dadosPessoais.nome = msg.body;
            await sendMessageWithTyping(client, msg.from, `Notei que seu número é "${whatsappPhone}".`);
            await sendMessageWithTyping(client, msg.from,
                `Você quer:\n` +
                `1 - Usar este mesmo número para contato\n` +
                `2 - Informar outro número`
            );
            orderData[msg.from].estadoDadosPessoais = 3;
            return "AGUARDANDO_DADOS_PESSOAIS";

        case 3:
            if (msg.body === '1') {
                orderData[msg.from].dadosPessoais.telefone = whatsappPhone;
                await sendMessageWithTyping(client, msg.from, "Por último, qual é o seu email?");
                orderData[msg.from].estadoDadosPessoais = 5;
            } else if (msg.body === '2') {
                await sendMessageWithTyping(client, msg.from, "Por favor, informe o número de telefone para contato:");
                orderData[msg.from].estadoDadosPessoais = 4;
            } else {
                await sendMessageWithTyping(client, msg.from, `❌ Opção inválida!`);
                await sendMessageWithTyping(client, msg.from,
                    `Por favor, escolha:\n` +
                    `1 - Usar o número "${whatsappPhone}"\n` +
                    `2 - Informar outro número`
                );
            }
            return "AGUARDANDO_DADOS_PESSOAIS";

        case 4:
            orderData[msg.from].dadosPessoais.telefone = formatarNumeroTelefone(msg.body);
            await sendMessageWithTyping(client, msg.from, "Por último, qual é o seu email?");
            orderData[msg.from].estadoDadosPessoais = 5;
            return "AGUARDANDO_DADOS_PESSOAIS";

        case 5:
            orderData[msg.from].dadosPessoais.email = msg.body;
            delete orderData[msg.from].estadoDadosPessoais;

            if (orderData[msg.from].voltarParaRevisao) {
                const resumoAtualizado = generateResume(orderData[msg.from], {
                    includeOrderDetails: true,
                    includeTimestamp: true
                });

                await sendMessageWithTyping(client, msg.from, "📋 Aqui está o resumo atualizado do seu pedido:");
                await sendMessageWithTyping(client, msg.from, resumoAtualizado);

                await sendMessageWithTyping(client, msg.from,
                    "Você gostaria de revisar ou alterar mais alguma informação?\n\n" +
                    "1 - Não, pode finalizar o pedido\n" +
                    "2 - Sim, alterar dados pessoais\n" +
                    "3 - Sim, alterar endereço de entrega\n" +
                    "4 - Sim, alterar forma de pagamento\n" +
                    "5 - Sim, alterar todas as informações"
                );
                return "REVISAO_PEDIDO";
            } else if (orderData[msg.from].alterarTudo) {
                await sendMessageWithTyping(client, msg.from, "Agora preciso saber o endereço de entrega.");
                await sendMessageWithTyping(client, msg.from,
                    "Qual o tipo de entrega?\n" +
                    "1 - Casa\n" +
                    "2 - Apartamento"
                );
                return "ESCOLHA_TIPO_ENTREGA";
            } else {
                await sendMessageWithTyping(client, msg.from, menuPagamento);
                return "AGUARDANDO_FORMA_PAGAMENTO";
            }

        default:
            await sendMessageWithTyping(client, msg.from, `Notei que seu nome no WhatsApp é "${whatsappName}".`);
            await sendMessageWithTyping(client, msg.from,
                `Você quer:\n` +
                `1 - Usar este mesmo nome\n` +
                `2 - Informar outro nome`
            );
            orderData[msg.from].estadoDadosPessoais = 1;
            return "AGUARDANDO_DADOS_PESSOAIS";
    }
}

async function coletarDadosCasa(msg, client, orderData) {
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    if (!orderData[msg.from]) {
        orderData[msg.from] = {};
    }

    const estado = orderData[msg.from].estadoDadosCasa || 0;

    if (!orderData[msg.from].endereco) {
        orderData[msg.from].endereco = { tipo: 'casa' };
    }

    const perguntas = [
        "Qual o nome da sua rua ou avenida?",
        "Qual o número da casa?",
        "Qual o CEP?",
        "Por favor, informe um ponto de referência:"
    ];

    switch (estado) {
        case 0:
            orderData[msg.from].endereco.rua = msg.body;
            await sendMessageWithTyping(client, msg.from, perguntas[1]);
            orderData[msg.from].estadoDadosCasa = 1;
            return "AGUARDANDO_DADOS_CASA";

        case 1:
            orderData[msg.from].endereco.numero = msg.body;
            await sendMessageWithTyping(client, msg.from, perguntas[2]);
            orderData[msg.from].estadoDadosCasa = 2;
            return "AGUARDANDO_DADOS_CASA";

        case 2:
            orderData[msg.from].endereco.cep = msg.body;
            await sendMessageWithTyping(client, msg.from, perguntas[3]);
            orderData[msg.from].estadoDadosCasa = 3;
            return "AGUARDANDO_DADOS_CASA";

        case 3:
            orderData[msg.from].endereco.referencia = msg.body;
            delete orderData[msg.from].estadoDadosCasa;

            if (orderData[msg.from].voltarParaRevisao) {
                const resumoAtualizado = generateResume(orderData[msg.from], {
                    includeOrderDetails: true,
                    includeTimestamp: true
                });

                await sendMessageWithTyping(client, msg.from, "📋 Aqui está o resumo atualizado do seu pedido:");
                await sendMessageWithTyping(client, msg.from, resumoAtualizado);

                await sendMessageWithTyping(client, msg.from,
                    "Você gostaria de revisar ou alterar mais alguma informação?\n\n" +
                    "1 - Não, pode finalizar o pedido\n" +
                    "2 - Sim, alterar dados pessoais\n" +
                    "3 - Sim, alterar endereço de entrega\n" +
                    "4 - Sim, alterar forma de pagamento\n" +
                    "5 - Sim, alterar todas as informações"
                );
                return "REVISAO_PEDIDO";
            } else {
                await sendMessageWithTyping(client, msg.from, menuPagamento);
                if (orderData[msg.from].alterarTudo) {
                    orderData[msg.from].alterarTudo = false;
                }
                return "AGUARDANDO_FORMA_PAGAMENTO";
            }

        default:
            await sendMessageWithTyping(client, msg.from, perguntas[0]);
            orderData[msg.from].estadoDadosCasa = 0;
            return "AGUARDANDO_DADOS_CASA";
    }
}

async function coletarDadosApartamento(msg, client, orderData) {
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    if (!orderData[msg.from]) {
        orderData[msg.from] = {};
    }

    const estado = orderData[msg.from].estadoDadosApt || 0;

    if (!orderData[msg.from].endereco) {
        orderData[msg.from].endereco = { tipo: 'apartamento' };
    }

    const perguntas = [
        "Qual o nome da rua ou avenida?",
        "Qual o número do condomínio?",
        "Qual o nome do condomínio?",
        "Qual o bloco do seu apartamento?",
        "Qual o número do seu apartamento?",
        "Por último, qual o CEP?"
    ];

    switch (estado) {
        case 0:
            orderData[msg.from].endereco.rua = msg.body;
            await sendMessageWithTyping(client, msg.from, perguntas[1]);
            orderData[msg.from].estadoDadosApt = 1;
            return "AGUARDANDO_DADOS_APARTAMENTO";

        case 1:
            orderData[msg.from].endereco.numeroCondominio = msg.body;
            await sendMessageWithTyping(client, msg.from, perguntas[2]);
            orderData[msg.from].estadoDadosApt = 2;
            return "AGUARDANDO_DADOS_APARTAMENTO";

        case 2:
            orderData[msg.from].endereco.nomeCondominio = msg.body;
            await sendMessageWithTyping(client, msg.from, perguntas[3]);
            orderData[msg.from].estadoDadosApt = 3;
            return "AGUARDANDO_DADOS_APARTAMENTO";

        case 3:
            orderData[msg.from].endereco.bloco = msg.body;
            await sendMessageWithTyping(client, msg.from, perguntas[4]);
            orderData[msg.from].estadoDadosApt = 4;
            return "AGUARDANDO_DADOS_APARTAMENTO";

        case 4:
            orderData[msg.from].endereco.apartamento = msg.body;
            await sendMessageWithTyping(client, msg.from, perguntas[5]);
            orderData[msg.from].estadoDadosApt = 5;
            return "AGUARDANDO_DADOS_APARTAMENTO";

        case 5:
            orderData[msg.from].endereco.cep = msg.body;
            delete orderData[msg.from].estadoDadosApt;

            if (orderData[msg.from].voltarParaRevisao) {
                const resumoAtualizado = generateResume(orderData[msg.from], {
                    includeOrderDetails: true,
                    includeTimestamp: true
                });

                await sendMessageWithTyping(client, msg.from, "📋 Aqui está o resumo atualizado do seu pedido:");
                await sendMessageWithTyping(client, msg.from, resumoAtualizado);

                await sendMessageWithTyping(client, msg.from,
                    "Você gostaria de revisar ou alterar mais alguma informação?\n\n" +
                    "1 - Não, pode finalizar o pedido\n" +
                    "2 - Sim, alterar dados pessoais\n" +
                    "3 - Sim, alterar endereço de entrega\n" +
                    "4 - Sim, alterar forma de pagamento\n" +
                    "5 - Sim, alterar todas as informações"
                );
                return "REVISAO_PEDIDO";
            } else {
                await sendMessageWithTyping(client, msg.from, menuPagamento);
                if (orderData[msg.from].alterarTudo) {
                    orderData[msg.from].alterarTudo = false;
                }
                return "AGUARDANDO_FORMA_PAGAMENTO";
            }

        default:
            await sendMessageWithTyping(client, msg.from, perguntas[0]);
            orderData[msg.from].estadoDadosApt = 0;
            return "AGUARDANDO_DADOS_APARTAMENTO";
    }
}

module.exports = {
    coletarDadosPessoais,
    coletarDadosCasa,
    coletarDadosApartamento
};
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const moment = require('moment-timezone');

const { menuPrincipal, menuPagamento, submenus, subcategorias, categoriasSimples, catalogos, formasPagamento } = require('./menus');
const { getAtendenteDisponivel, sendMessageWithTyping, generateGreeting, handleInactivityTimeout, updateUserActivity, handleInvalidInput, validateInputForState, ErrorHandler, BotState } = require('./functions');
const { coletarDadosPessoais, coletarDadosCasa, coletarDadosApartamento } = require('./dataCollectors');
const { saveCustomerInfo, getCustomerInfo, generateResume } = require('./customerStorage');
const { atendentes } = require('./atendentes');
const googleSheets = require('./googlesheets');

const orderData = {
    botActive: {}
};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
    }
});

let botStartTime;

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('Bot PaebitStore está online! 🦜');
    botStartTime = moment().tz('America/Sao_Paulo');

    try {
        await googleSheets.initializeSheetsApi();
    } catch (error) {
        console.error('Error initializing Google Sheets:', error);
    }

    Object.values(atendentes).forEach(async (atendente) => {
        await client.sendMessage(`${atendente.numero}@c.us`,
            '🦜 Bot PaebitStore iniciado e pronto para atendimento!');
    });
});

async function encaminharParaAtendente(msg, resumoPedido) {

    try {
        await googleSheets.addOrderToSheet(orderData[msg.from]);
        const atendente = getAtendenteDisponivel(atendentes);

        const resumoFinal = generateResume(orderData[msg.from], {
            includeOrderDetails: true,
            includeTimestamp: true
        });

        if (orderData[msg.from]?.dadosPessoais && orderData[msg.from]?.endereco) {
            const customerInfo = {
                dadosPessoais: orderData[msg.from].dadosPessoais,
                endereco: orderData[msg.from].endereco
            };
            saveCustomerInfo(msg.from.replace('@c.us', ''), customerInfo);
        }

        if (atendente) {

            await sendMessageWithTyping(client, msg.from, `Ótimo! Seu pedido foi registrado com sucesso! 🦜`);
            await sendMessageWithTyping(client, msg.from, `Para fazer um novo pedido, basta digitar "*novo pedido*" a qualquer momento! 😊`);
            await sendMessageWithTyping(client, msg.from, `${atendente.nome} já vai assumir seu atendimento para finalizar sua compra. `);
            await sendMessageWithTyping(client, msg.from, `Aguarde um momento, por favor! 😊`);

            await client.sendMessage(`${atendente.numero}@c.us`,
                `‼️ Novo pedido recebido ‼️\n\n` + resumoFinal);

            const outrosAtendentes = Object.values(atendentes)
                .filter(a => a.numero !== atendente.numero);

            for (const outro of outrosAtendentes) {
                await client.sendMessage(`${outro.numero}@c.us`,
                    `ℹ️ Novo pedido recebido (para acompanhamento) ℹ️\n\n` +
                    `Atendente principal: ${atendente.nome}\n` + resumoFinal);
            }
        } else {
            await sendMessageWithTyping(client, msg.from, `Recebemos seu pedido! 🦜`);
            await sendMessageWithTyping(client, msg.from, `Nosso horário de atendimento é das 8h às 20h, retornaremos assim que estivermos disponíveis!`);
            await sendMessageWithTyping(client, msg.from, `Para fazer um novo pedido, basta digitar "*novo pedido*" a qualquer momento! 😊`);
            await sendMessageWithTyping(client, msg.from, `Agradecemos sua preferência! 🙏`);

            for (const atendente of Object.values(atendentes)) {
                await client.sendMessage(`${atendente.numero}@c.us`,
                    `⚠️ Pedido recebido fora do horário ⚠️\n\n` + resumoFinal);
            }
        }
    } catch (error) {
        console.error('Error adding order to Google Sheets:', error);
    }
}

client.on('message', async msg => {
    try {
        const currentState = BotState.getState(msg.from);

        if (!validateInputForState(msg.body, currentState.estado)) {
            await handleInvalidInput(msg, client, currentState.estado);
            return;
        }

        const userId = msg.from.replace('@c.us', '');
        if (!orderData[msg.from]) {
            orderData[msg.from] = {
                estado: 'INICIAL',
                botActive: true,
                firstContact: Date.now()
            };
        }
        updateUserActivity(userId);

        orderData[msg.from] = handleInactivityTimeout(msg.from, orderData);

        if (msg.from.endsWith('@g.us')) {
            console.log('Mensagem de grupo detectada pelo ID, ignorando...');
            return;
        }

        const messageTime = moment(msg.timestamp * 1000).tz('America/Sao_Paulo');

        if (messageTime.isBefore(botStartTime)) {
            console.log('Mensagem antiga detectada, ignorando...');
            return;
        }

        if (orderData[msg.from]?.estado === 'FINALIZADO' &&
            orderData[msg.from]?.finalMessagesSent &&
            !orderData[msg.from]?.botActive &&
            msg.body.toLowerCase() !== 'novo pedido') {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const whatsappName = contact.pushname || '';

        if (chat?.isGroup || msg.from.endsWith('@g.us')) {
            console.log('Mensagem de grupo detectada, ignorando...');
            return;
        }

        await chat.sendStateTyping();

        orderData[msg.from] = orderData[msg.from] || { estado: 'INICIAL' };
        const estado = orderData[msg.from].estado;

        switch (estado) {
            case 'INICIAL':
                const greeting = generateGreeting(whatsappName);
                await sendMessageWithTyping(client, msg.from, greeting);
                await sendMessageWithTyping(client, msg.from, `Bem-vindo à PaebitStore! 🦜`);
                await sendMessageWithTyping(client, msg.from, `Sou o assistente virtual da loja e vou te ajudar com seu pedido!`);
                await sendMessageWithTyping(client, msg.from, menuPrincipal);
                orderData[msg.from].estado = 'AGUARDANDO_ESCOLHA_CATEGORIA';
                break;

            case 'AGUARDANDO_ESCOLHA_CATEGORIA':
                if (submenus[msg.body]) {
                    orderData[msg.from].categoriaEscolhida = msg.body;
                    await sendMessageWithTyping(client, msg.from, submenus[msg.body]);
                    orderData[msg.from].estado = 'AGUARDANDO_ESCOLHA_SUBCATEGORIA';
                }
                else if (categoriasSimples[msg.body]) {
                    const categoria = categoriasSimples[msg.body];
                    await sendMessageWithTyping(client, msg.from, `Ótima escolha! Aqui está nosso catálogo de ${categoria.nome}:\n${catalogos[categoria.catalogo]}`);
                    await sendMessageWithTyping(client, msg.from, "Após escolher o produto, por favor, envie o link ou uma foto do item desejado.");
                    orderData[msg.from].estado = 'AGUARDANDO_CONFIRMACAO_PRODUTO';
                }
                else {
                    await sendMessageWithTyping(client, msg.from, `❌ Opção inválida!`);
                    await sendMessageWithTyping(client, msg.from,
                        `Por favor, escolha uma opção válida do menu:\n` +
                        menuPrincipal);
                }
                break;

            case 'AGUARDANDO_ESCOLHA_SUBCATEGORIA':
                const categoriaAtual = orderData[msg.from].categoriaEscolhida;
                const subcategoriasDisponiveis = subcategorias[categoriaAtual];

                if (subcategoriasDisponiveis && subcategoriasDisponiveis[msg.body]) {
                    const subcategoria = subcategoriasDisponiveis[msg.body];
                    orderData[msg.from].subcategoriaEscolhida = msg.body;
                    await sendMessageWithTyping(client, msg.from,
                        `Ótima escolha! Aqui está nosso catálogo de ${subcategoria.nome}:\n${catalogos[subcategoria.catalogo]}`);
                    await sendMessageWithTyping(client, msg.from,
                        "Após escolher o produto, por favor, envie o link ou uma foto do item desejado.");
                    orderData[msg.from].estado = 'AGUARDANDO_CONFIRMACAO_PRODUTO';
                } else {
                    await sendMessageWithTyping(client, msg.from, `❌ Opção inválida!`);
                    await sendMessageWithTyping(client, msg.from, `Por favor, escolha uma opção válida`);
                }
                break;

            case 'AGUARDANDO_CONFIRMACAO_PRODUTO':
                const mensagemLower = msg.body.toLowerCase();
                if (mensagemLower.includes('preço') ||
                    mensagemLower.includes('preco') ||
                    mensagemLower.includes('valor') ||
                    mensagemLower.includes('quanto') ||
                    mensagemLower.includes('custa')) {

                    await sendMessageWithTyping(client, msg.from,
                        "Entendi que você gostaria de saber mais informações sobre preços. Como posso te ajudar?\n\n" +
                        "1 - Seguir com a compra do produto escolhido\n" +
                        "2 - Falar com um de nossos vendedores"
                    );
                    orderData[msg.from].estado = 'DECISAO_ATENDIMENTO';
                    break;
                }

                orderData[msg.from].produto = msg.body;

                await sendMessageWithTyping(client, msg.from,
                    "Produto selecionado! Nossa entrega é GRÁTIS! 🚚✨"
                );

                const savedCustomerInfo = getCustomerInfo(msg.from.replace('@c.us', ''));

                if (savedCustomerInfo) {
                    await sendMessageWithTyping(client, msg.from,
                        "✨ Encontrei um endereço de entrega salvo de um pedido anterior! " +
                        "Vamos continuar com o pedido e no final você poderá revisar e alterar todas as informações se desejar."
                    );

                    orderData[msg.from].dadosPessoais = savedCustomerInfo.dadosPessoais;
                    orderData[msg.from].endereco = savedCustomerInfo.endereco;

                    await sendMessageWithTyping(client, msg.from, menuPagamento);
                    orderData[msg.from].estado = 'AGUARDANDO_FORMA_PAGAMENTO';
                } else {
                    await sendMessageWithTyping(client, msg.from,
                        "Agora vou precisar de alguns dados seus para finalizar o pedido."
                    );

                    if (whatsappName) {
                        await sendMessageWithTyping(client, msg.from,
                            `Notei que seu nome no WhatsApp é "${whatsappName}".`
                        );
                        await sendMessageWithTyping(client, msg.from,
                            `Você quer:\n` +
                            `1 - Usar este mesmo nome\n` +
                            `2 - Informar outro nome`
                        );
                        orderData[msg.from].estadoDadosPessoais = 1;
                    } else {
                        await sendMessageWithTyping(client, msg.from,
                            "Por favor, informe seu nome completo:"
                        );
                        orderData[msg.from].estadoDadosPessoais = 2;
                    }
                    orderData[msg.from].estado = 'AGUARDANDO_DADOS_PESSOAIS';
                }
                break;

            case 'DECISAO_DADOS_SALVOS':
                if (msg.body === '1') {
                    orderData[msg.from].dadosPessoais = savedCustomerInfo.dadosPessoais;
                    orderData[msg.from].endereco = savedCustomerInfo.endereco;
                    await sendMessageWithTyping(client, msg.from, menuPagamento);
                    orderData[msg.from].estado = 'AGUARDANDO_FORMA_PAGAMENTO';
                } else if (msg.body === '2') {
                    if (whatsappName) {
                        await sendMessageWithTyping(client, msg.from,
                            `Notei que seu nome no WhatsApp é "${whatsappName}".`
                        );
                        await sendMessageWithTyping(client, msg.from,
                            `Você quer:\n` +
                            `1 - Usar este mesmo nome\n` +
                            `2 - Informar outro nome`
                        );
                        orderData[msg.from].estadoDadosPessoais = 1;
                    } else {
                        await sendMessageWithTyping(client, msg.from,
                            "Por favor, informe seu nome completo:"
                        );
                        orderData[msg.from].estadoDadosPessoais = 2;
                    }
                    orderData[msg.from].estado = 'AGUARDANDO_DADOS_PESSOAIS';
                } else {
                    await sendMessageWithTyping(client, msg.from,
                        "Por favor, escolha uma opção válida:\n" +
                        "1 - Usar dados salvos\n" +
                        "2 - Informar novos dados"
                    );
                }
                break;

            case 'DECISAO_ATENDIMENTO':
                if (msg.body === '1') {
                    const categoriaAtual = orderData[msg.from].categoriaEscolhida;

                    if (!categoriaAtual) {
                        await sendMessageWithTyping(client, msg.from, menuPrincipal);
                        orderData[msg.from].estado = 'AGUARDANDO_ESCOLHA_CATEGORIA';
                        return;
                    }

                    if (categoriasSimples[categoriaAtual]) {
                        const categoria = categoriasSimples[categoriaAtual];
                        await sendMessageWithTyping(client, msg.from,
                            `Aqui está nosso catálogo de ${categoria.nome}:\n${catalogos[categoria.catalogo]}`);
                    }
                    else if (submenus[categoriaAtual]) {
                        await sendMessageWithTyping(client, msg.from, submenus[categoriaAtual]);
                        orderData[msg.from].estado = 'AGUARDANDO_ESCOLHA_SUBCATEGORIA';
                        return;
                    }

                    await sendMessageWithTyping(client, msg.from,
                        "Após escolher o produto, por favor, envie o link ou uma foto do item desejado.");
                    orderData[msg.from].estado = 'AGUARDANDO_CONFIRMACAO_PRODUTO';
                } else if (msg.body === '2') {
                    const atendente = getAtendenteDisponivel(atendentes);

                    if (atendente) {
                        await sendMessageWithTyping(client, msg.from,
                            `Claro! Vou encaminhar você para ${atendente.nome}, que vai te ajudar com todas as informações sobre preços e produtos! 😊`
                        );

                        await client.sendMessage(`${atendente.numero}@c.us`,
                            `‼️ Cliente solicitando informações sobre preços ‼️\n\n` +
                            `Nome: ${whatsappName || 'Não identificado'}\n` +
                            `Número: ${msg.from.replace('@c.us', '')}`
                        );

                        orderData[msg.from].estado = 'FINALIZADO';
                    } else {
                        await sendMessageWithTyping(client, msg.from,
                            "Nosso horário de atendimento é das 8h às 20h. Um de nossos vendedores entrará em contato assim que possível! 🙏"
                        );

                        for (const atendente of Object.values(atendentes)) {
                            await client.sendMessage(`${atendente.numero}@c.us`,
                                `⚠️ Cliente solicitou informações sobre preços fora do horário ⚠️\n\n` +
                                `Nome: ${whatsappName || 'Não identificado'}\n` +
                                `Número: ${msg.from.replace('@c.us', '')}`
                            );
                        }

                        orderData[msg.from].estado = 'FINALIZADO';
                    }
                } else {
                    await sendMessageWithTyping(client, msg.from,
                        "Por favor, escolha uma opção válida:\n\n" +
                        "1 - Seguir com a compra do produto escolhido\n" +
                        "2 - Falar com um de nossos vendedores"
                    );
                }
                break;

            case 'AGUARDANDO_DADOS_PESSOAIS':
                const novosEstados = await coletarDadosPessoais(msg, client, orderData);

                if (novosEstados === "AGUARDANDO_FORMA_PAGAMENTO" && !orderData[msg.from].alterarTudo) {
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
                        orderData[msg.from].estado = 'REVISAO_PEDIDO';
                    } else {
                        orderData[msg.from].estado = novosEstados;
                    }
                } else {
                    orderData[msg.from].estado = novosEstados;
                }
                break;

                case 'ESCOLHA_TIPO_ENTREGA':
                    if (msg.body === '1') {
                        orderData[msg.from].endereco = {
                            tipo: 'casa',
                            rua: null,
                            numero: null,
                            cep: null,
                            referencia: null
                        };
                        
                        await sendMessageWithTyping(client, msg.from, "Qual o nome da sua rua ou avenida?");
                        orderData[msg.from].estado = 'AGUARDANDO_DADOS_CASA';
                        orderData[msg.from].estadoDadosCasa = 0;
                    } 
                    else if (msg.body === '2') {
                        orderData[msg.from].endereco = {
                            tipo: 'apartamento',
                            rua: null,
                            numeroCondominio: null,
                            nomeCondominio: null,
                            bloco: null,
                            apartamento: null,
                            cep: null
                        };
                        
                        await sendMessageWithTyping(client, msg.from, "Qual o nome da rua ou avenida?");
                        orderData[msg.from].estado = 'AGUARDANDO_DADOS_APARTAMENTO';
                        orderData[msg.from].estadoDadosApt = 0;
                    } 
                    else {
                        await sendMessageWithTyping(client, msg.from, `❌ Opção inválida!`);
                        await sendMessageWithTyping(client, msg.from, `Por favor, escolha:\n1 - Casa\n2 - Apartamento`);
                    }
                    break;

            case 'AGUARDANDO_DADOS_CASA':
                const novoEstadoCasa = await coletarDadosCasa(msg, client, orderData);

                if (novoEstadoCasa === "AGUARDANDO_FORMA_PAGAMENTO" && !orderData[msg.from].alterarTudo) {
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
                        orderData[msg.from].estado = 'REVISAO_PEDIDO';
                    } else {
                        orderData[msg.from].estado = novoEstadoCasa;
                    }
                } else {
                    orderData[msg.from].estado = novoEstadoCasa;
                }
                break;

            case 'AGUARDANDO_DADOS_APARTAMENTO':
                const novoEstadoApt = await coletarDadosApartamento(msg, client, orderData);

                if (novoEstadoApt === "AGUARDANDO_FORMA_PAGAMENTO" && !orderData[msg.from].alterarTudo) {
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
                        orderData[msg.from].estado = 'REVISAO_PEDIDO';
                    } else {
                        orderData[msg.from].estado = novoEstadoApt;
                    }
                } else {
                    orderData[msg.from].estado = novoEstadoApt;
                }
                break;

            case 'AGUARDANDO_FORMA_PAGAMENTO':
                if (msg.body >= '1' && msg.body <= '9') {
                    orderData[msg.from].formaPagamento = formasPagamento[msg.body];

                    const resumoPedido = generateResume(orderData[msg.from], {
                        includeOrderDetails: true,
                        includeTimestamp: true
                    });

                    await sendMessageWithTyping(client, msg.from, "📋 Aqui está o resumo completo do seu pedido:");
                    await sendMessageWithTyping(client, msg.from, resumoPedido);

                    await sendMessageWithTyping(client, msg.from,
                        "Você gostaria de revisar ou alterar alguma informação?\n\n" +
                        "1 - Não, pode finalizar o pedido\n" +
                        "2 - Sim, alterar dados pessoais\n" +
                        "3 - Sim, alterar endereço de entrega\n" +
                        "4 - Sim, alterar forma de pagamento\n" +
                        "5 - Sim, alterar todas as informações"
                    );
                    orderData[msg.from].estado = 'REVISAO_PEDIDO';
                } else {
                    await sendMessageWithTyping(client, msg.from, "Por favor, escolha uma forma de pagamento válida:");
                    await sendMessageWithTyping(client, msg.from, menuPagamento);
                }
                break;

            case 'REVISAO_PEDIDO':
                switch (msg.body) {
                    case '1':
                        const resumoFinal = generateResume(orderData[msg.from], {
                            includeOrderDetails: true,
                            includeTimestamp: true
                        });
                        await encaminharParaAtendente(msg, resumoFinal);
                        orderData[msg.from].estado = 'FINALIZADO';
                        break;

                    case '2':
                        if (whatsappName) {
                            await sendMessageWithTyping(client, msg.from,
                                `Notei que seu nome no WhatsApp é "${whatsappName}".`
                            );
                            await sendMessageWithTyping(client, msg.from,
                                `Você quer:\n` +
                                `1 - Usar este mesmo nome\n` +
                                `2 - Informar outro nome`
                            );
                            orderData[msg.from].estadoDadosPessoais = 1;
                        } else {
                            await sendMessageWithTyping(client, msg.from,
                                "Por favor, informe seu nome completo:"
                            );
                            orderData[msg.from].estadoDadosPessoais = 2;
                        }
                        orderData[msg.from].estado = 'AGUARDANDO_DADOS_PESSOAIS';
                        orderData[msg.from].voltarParaRevisao = true;
                        break;

                    case '3':
                        await sendMessageWithTyping(client, msg.from,
                            "Qual o tipo de entrega?\n" +
                            "1 - Casa\n" +
                            "2 - Apartamento"
                        );
                        orderData[msg.from].estado = 'ESCOLHA_TIPO_ENTREGA';
                        orderData[msg.from].voltarParaRevisao = true;
                        break;

                    case '4':
                        await sendMessageWithTyping(client, msg.from, menuPagamento);
                        orderData[msg.from].estado = 'AGUARDANDO_FORMA_PAGAMENTO';
                        orderData[msg.from].voltarParaRevisao = true;
                        break;

                    case '5':
                        if (whatsappName) {
                            await sendMessageWithTyping(client, msg.from,
                                `Notei que seu nome no WhatsApp é "${whatsappName}".`
                            );
                            await sendMessageWithTyping(client, msg.from,
                                `Você quer:\n` +
                                `1 - Usar este mesmo nome\n` +
                                `2 - Informar outro nome`
                            );
                            orderData[msg.from].estadoDadosPessoais = 1;
                        } else {
                            await sendMessageWithTyping(client, msg.from,
                                "Por favor, informe seu nome completo:"
                            );
                            orderData[msg.from].estadoDadosPessoais = 2;
                        }
                        orderData[msg.from].estado = 'AGUARDANDO_DADOS_PESSOAIS';
                        orderData[msg.from].alterarTudo = true;
                        break;

                    default:
                        await sendMessageWithTyping(client, msg.from,
                            "Por favor, escolha uma opção válida:\n\n" +
                            "1 - Não, pode finalizar o pedido\n" +
                            "2 - Sim, alterar dados pessoais\n" +
                            "3 - Sim, alterar endereço de entrega\n" +
                            "4 - Sim, alterar forma de pagamento\n" +
                            "5 - Sim, alterar todas as informações"
                        );
                        break;
                }
                break;
            case 'FINALIZADO':
                if (msg.body.toLowerCase() === 'novo pedido') {

                    if (orderData[msg.from]?.dadosPessoais && orderData[msg.from]?.endereco) {
                        const customerInfo = {
                            dadosPessoais: orderData[msg.from].dadosPessoais,
                            endereco: orderData[msg.from].endereco
                        };
                        saveCustomerInfo(msg.from.replace('@c.us', ''), customerInfo);
                    }

                    orderData[msg.from].botActive = true;

                    const wasActive = orderData[msg.from].botActive;
                    delete orderData[msg.from];
                    orderData[msg.from] = {
                        estado: 'INICIAL',
                        botActive: wasActive
                    };

                    const greeting = generateGreeting(whatsappName);
                    await sendMessageWithTyping(client, msg.from, greeting);
                    await sendMessageWithTyping(client, msg.from, menuPrincipal);
                    orderData[msg.from].estado = 'AGUARDANDO_ESCOLHA_CATEGORIA';
                    return;
                }

                if (!orderData[msg.from].finalMessagesSent) {
                    await sendMessageWithTyping(client, msg.from,
                        `Nosso atendente já vai assumir a conversa para te ajudar! 🦜`);

                    orderData[msg.from].finalMessagesSent = true;
                    orderData[msg.from].botActive = false;
                }
                break;
        }
    } catch (error) {
        await ErrorHandler.handleError(error, msg, client, orderData);
        console.error('Erro ao processar mensagem:', {
            erro: error.message,
            stack: error.stack,
            de: msg.from,
            mensagem: msg.body,
            tipoMensagem: msg.type,
            timestamp: moment(msg.timestamp * 1000).format('DD/MM/YYYY HH:mm:ss')
        });

        if (!msg.from.endsWith('@g.us')) {
            try {
                await sendMessageWithTyping(client, msg.from,
                    "Desculpe, ocorreu um erro ao processar sua mensagem. " +
                    "Por favor, tente novamente em alguns instantes.");
            } catch (sendError) {
                console.error('Erro ao enviar mensagem de erro:', sendError);
            }
        }
    }
});

client.initialize();
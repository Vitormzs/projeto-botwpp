const menuPrincipal = 
`🏪 *MENU PAEBITSTORE* 🦜
Escolha o tipo de produto:

1 - Boné
2 - Camisa
3 - Bermuda
4 - Short
5 - Calça
6 - Cueca
7 - Carteira
8 - Meia
9 - Sandália

Digite o número da opção desejada.`;

const menuPagamento = 
`💳 *FORMAS DE PAGAMENTO* 💰
Escolha como deseja pagar:

1 - Dinheiro
2 - PIX
3 - Débito
4 - Crédito 1x
5 - Crédito 2x
6 - Crédito 3x
7 - Crédito 4x
8 - Crédito 5x
9 - Crédito 6x

Digite o número da opção desejada.`;

const menuCamisa = 
`👕 *TIPOS DE CAMISA*
Escolha o modelo:

1 - Camisa Básica
2 - Camisa Malhão
3 - Camisa Polo
4 - Regata

Digite o número da opção desejada.`;

const menuBermuda = 
`👖 *TIPOS DE BERMUDA*
Escolha o modelo:

1 - Bermuda Jeans
2 - Bermuda Sport Fino

Digite o número da opção desejada.`;

const menuShort = 
`🩳 *TIPOS DE SHORT*
Escolha o modelo:

1 - Short Linho e Sarja
2 - Short Tactel Hurley
3 - Short Impermeável

Digite o número da opção desejada.`;

const menuCalca = 
`👖 *TIPOS DE CALÇA*
Escolha o modelo:

1 - Calça Premium
2 - Calça Sport Fino

Digite o número da opção desejada.`;

const submenus = {
    '2': menuCamisa,
    '3': menuBermuda,
    '4': menuShort,
    '5': menuCalca
};

const subcategorias = {
    '2': {
        '1': { nome: 'Camisa Básica', catalogo: 'camisa_basica' },
        '2': { nome: 'Camisa Malhão', catalogo: 'camisa_malhao' },
        '3': { nome: 'Camisa Polo', catalogo: 'camisa_polo' },
        '4': { nome: 'Regata', catalogo: 'regata' }
    },
    '3': {
        '1': { nome: 'Bermuda Jeans', catalogo: 'bermuda_jeans' },
        '2': { nome: 'Bermuda Sport Fino', catalogo: 'bermuda_sport_fino' }
    },
    '4': {
        '1': { nome: 'Short Linho e Sarja', catalogo: 'short_linho_sarja' },
        '2': { nome: 'Short Tactel Hurley', catalogo: 'short_tactel' },
        '3': { nome: 'Short Impermeável', catalogo: 'short_impermeavel' }
    },
    '5': {
        '1': { nome: 'Calça Premium', catalogo: 'calca_premium' },
        '2': { nome: 'Calça Sport Fino', catalogo: 'calca_sport_fino' }
    }
};

const categoriasSimples = {
    '1': { nome: 'Boné', catalogo: 'bone' },
    '6': { nome: 'Cueca', catalogo: 'cueca' },
    '7': { nome: 'Carteira', catalogo: 'carteira' },
    '8': { nome: 'Meia', catalogo: 'meia' },
    '9': { nome: 'Sandália', catalogo: 'sandalia' }
};

const catalogos = {
    'bone': 'seu-link.com',
    'cueca': 'seu-link.com',
    'carteira': 'seu-link.com',
    'meia': 'seu-link.com',
    'sandalia': 'seu-link.com',

    'camisa_basica': 'seu-link.com',
    'camisa_malhao': 'seu-link.com',
    'camisa_polo': 'seu-link.com',
    'regata': 'seu-link.com',

    'bermuda_jeans': 'seu-link.com',
    'bermuda_sport_fino': 'seu-link.com',

    'short_linho_sarja': 'seu-link.com',
    'short_tactel': 'seu-link.com',
    'short_impermeavel': 'seu-link.com',

    'calca_premium': 'seu-link.com',
    'calca_sport_fino': 'seu-link.com'
};

const formasPagamento = {
    '1': 'Dinheiro',
    '2': 'PIX',
    '3': 'Débito',
    '4': 'Crédito 1x',
    '5': 'Crédito 2x',
    '6': 'Crédito 3x',
    '7': 'Crédito 4x',
    '8': 'Crédito 5x',
    '9': 'Crédito 6x'
};

module.exports = {
    menuPrincipal,
    menuPagamento,
    menuCamisa,
    menuBermuda,
    menuShort,
    menuCalca,
    submenus,
    subcategorias,
    categoriasSimples,
    catalogos,
    formasPagamento
};

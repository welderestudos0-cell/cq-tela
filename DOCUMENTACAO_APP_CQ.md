# DOCUMENTAÇÃO — APLICATIVO DE CONTROLE DE QUALIDADE

---

## OBJETIVO DO APLICATIVO

Desenvolvimento de um aplicativo mobile voltado para a realização de análises e check-lists executados pelo setor de Controle de Qualidade.

A proposta tem como objetivo principal modernizar e otimizar os processos atualmente realizados de forma manual, promovendo maior agilidade, padronização e confiabilidade na coleta e no tratamento das informações.

Com a implementação do APP, será possível:

- Realizar inspeções em tempo real, diretamente nos locais de operação
- Reduzir falhas humanas, retrabalho e perda de dados
- Padronizar os critérios de análise entre todos os colaboradores
- Acessar rapidamente os dados coletados para auditorias e acompanhamento de indicadores
- Fortalecer a cultura de qualidade na organização

**Funcionalidades essenciais:**
- Preenchimento digital de check-lists
- Registro de não conformidades
- Inserção de evidências fotográficas
- Geração automática de relatórios em PDF
- Armazenamento seguro das informações
- Suporte a rascunhos com salvamento local

---

## MÓDULOS DO APLICATIVO

Os módulos contemplados no APP são:

1. Análise de Fruto
2. Avaliação de Refugo
3. Análise de Maturação Forçada
4. Controle de Expedição e Containers Refrigerados
5. Análise de Shelf-Life

---

## MÓDULO: RELATÓRIO DE EMBARQUE

### Descrição

O Relatório de Embarque é o módulo responsável pelo controle de qualidade no processo de expedição de manga em containers refrigerados.

É um formulário digital de registro fotográfico e check-list, que substitui o processo manual atualmente realizado em campo.

O relatório é bilíngue (Português / Inglês), pois o PDF gerado é destinado também a clientes e parceiros internacionais.

---

### Fluxo de Navegação (Abas/Steps)

O formulário é dividido nas seguintes etapas:

| Etapa | Nome |
|-------|------|
| 1 | Informações Gerais |
| 2 | Priorização |
| 3 | Mangas |
| 4 | Container |
| 5 | Rascunhos |

---

### Informações Gerais

Campos de identificação do embarque:

| Campo | Descrição |
|-------|-----------|
| Customer | Cliente |
| Container | Número do container |
| OC | Ordem de compra |
| Loading | Data de carregamento |
| ETD | Estimated Time of Departure (Data prevista de saída) |
| ETA | Estimated Time of Arrival (Data prevista de chegada) |
| Vessel | Nome do navio |

---

### Seção: Manga (por Variedade)

Para cada variedade de manga carregada no container, são registradas fotos dos seguintes itens:

| Item | Descrição (PT) | Descrição (EN) |
|------|----------------|----------------|
| Aparência | Aparência do fruto | Appearance |
| Temperatura da polpa | Medição da temperatura interna | Pulp Temperature |
| Maturação | Estágio de maturação | Maturity |
| Firmeza | Firmeza do fruto | Firmness |

**Variedades suportadas (padrão):**
KENT, KEITT, TOMMY ATKINS, PALMER, OSTEEN, OMER, NOA, SHELLY

O módulo permite adicionar variedades personalizadas. Cada variedade gera uma seção própria de fotos no relatório.

---

### Seção: Priorização (Fotos Gerais do Container)

Fotos obrigatórias a serem registradas para o container:

| # | Item | Descrição (EN) |
|---|------|----------------|
| 1 | Maturação por variedade do container | Maturity by variety |
| 2 | Firmeza por variedade do container | Firmness by variety |
| 3 | Temperaturas de polpa por variedade (2 fotos) | Pulp temperatures by variety |
| 4 | Espelho de pallet por variedade (1 foto) | Pallet mirror by variety |
| 5 | Set point do container | Container set point |
| 6 | Foto dos 4 drenos | Four drains |
| 7 | Foto da numeração interna | Internal numbering |
| 8 | Foto da numeração externa | External numbering |
| 9 | Foto do termógrafo | Thermograph |
| 10 | Foto do container lacrado | Sealed container |
| 11 | Foto do nº do lacre | Seal number |

---

### Seção: Check-list do Container

Check-list de conformidade do container refrigerado, com resposta Conforme (C) ou Não Conforme (NC):

| # | Item |
|---|------|
| 1 | Interior do container está limpo (livre de odor, sem materiais estranhos, madeira, insetos, etc.) |
| 2 | Container sem estragos (borrachas da porta estão em bom estado) |
| 3 | Drenagem do container está aberta |
| 4 | Maquinário de refrigeração está operando corretamente |
| 5 | Container está pré-resfriado na temperatura correta *(campo de temperatura)* |
| 6 | Ventilação do container exposta *(resposta: Sim / Não)* |
| 7 | Ventilação a 40 CBM |
| 8 | A identificação/documentação do container está correta |
| 9 | Foi verificado se os sensores de temperatura estão funcionando corretamente |
| 10 | Registradores portáteis de temperatura foram colocados na posição correta na carga |
| 11 | Foi feito uso de absorvedor de etileno *(resposta: Sim / Não)* |
| 12 | O container foi sanitizado com solução a base de ácido peracético |
| 13 | Qualidade da paletização (fitas, estrado e alinhamento das caixas). Não conformes |
| 14 | A carga está na temperatura correta (temperatura média de polpa) |
| 15 | Lacre está devidamente colocado na porta do container |
| 16 | Temperatura de saída do container *(campo de temperatura)* |

---

### Controle de Pallets

Tabela de registro de pallets com:

- Número do pallet
- Etiqueta (padrão: NC)
- Temperatura 1
- Temperatura 2

---

### Rascunhos

- O formulário salva rascunhos automaticamente no dispositivo
- Rascunhos ficam disponíveis por 15 dias
- São identificados por: Cliente | Variedade | Container | Navio
- Permitem retomar o preenchimento de onde parou

---

### Geração de Relatório (PDF)

Ao finalizar o preenchimento, o sistema gera automaticamente um relatório em PDF contendo:

- Cabeçalho com banner e identificação do embarque
- Informações gerais do container (cliente, navio, datas, OC)
- Fotos organizadas por seção e item
- Check-list de conformidade do container
- Tabela de pallets
- Layout bilíngue (PT / EN) para uso internacional

O PDF pode ser compartilhado diretamente pelo dispositivo e também enviado ao servidor via API.

---

### Integrações Técnicas

- **API backend:** envio do relatório e fotos ao servidor
- **Armazenamento local:** AsyncStorage para rascunhos e cache de dados (clientes, variedades, navios)
- **Câmera / Galeria:** captura e seleção de fotos via expo-image-picker
- **Otimização de imagens:** compressão automática antes do envio (largura máx. 1280px, qualidade 68%)
- **Compartilhamento:** geração e compartilhamento do PDF via expo-sharing

---

*Documentação gerada em: Abril/2026*

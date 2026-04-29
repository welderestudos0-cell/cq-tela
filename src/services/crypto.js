// 🔧 DEBUG E CORREÇÃO DO ERRO DE CRIPTOGRAFIA

// ================================================================
// PROBLEMA: "Erro na criptografia"
// ================================================================

// 1. VERSÃO MELHORADA DA FUNÇÃO ENCRYPT (services/crypto.js)
// ================================================================
import CryptoJS from 'crypto-js';

const SECRET_KEY = 'MANGO_APP_SECRET_2024_SECURE_KEY_12345';

export const encrypt = (data) => {
  try {
    // ✅ VERIFICAÇÕES ANTES DE CRIPTOGRAFAR
    if (data === null || data === undefined) {
      console.log('Dados null/undefined para criptografar');
      return null;
    }

    // ✅ VERIFICAR SE É UM OBJETO CIRCULAR
    let jsonString;
    try {
      jsonString = JSON.stringify(data);
    } catch (jsonError) {
      console.error('Erro ao converter para JSON:', jsonError.message);
      return null;
    }

    // ✅ VERIFICAR SE JSON NÃO ESTÁ VAZIO
    if (!jsonString || jsonString === '{}' || jsonString === '[]') {
      console.log('Dados vazios para criptografar');
      return null;
    }

    // ✅ CRIPTOGRAFAR
    const encrypted = CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString();
    
    if (!encrypted) {
      console.error('Falha na criptografia - resultado vazio');
      return null;
    }

    return encrypted;
  } catch (error) {
    console.error('Erro na criptografia:', error.message);
    console.error('Dados que causaram erro:', typeof data, data);
    return null;
  }
};

export const decrypt = (encryptedData) => {
  try {
    // ✅ VERIFICAÇÕES ANTES DE DESCRIPTOGRAFAR
    if (!encryptedData || typeof encryptedData !== 'string') {
      return null;
    }

    if (encryptedData.length < 10) {
      return null;
    }

    // ✅ DESCRIPTOGRAFAR
    const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!decrypted) {
      return null;
    }

    // ✅ PARSE JSON
    return JSON.parse(decrypted);
  } catch (error) {
    return null; // Silencioso para compatibilidade
  }
};

// ================================================================
// 2. SOLUÇÃO TEMPORÁRIA: USAR SEM CRIPTOGRAFIA
// ================================================================
// Se o erro persistir, use esta versão temporária:

export const encryptTemp = (data) => {
  try {
    // ✅ VERSÃO SEM CRIPTOGRAFIA PARA TESTE
    if (!data) return null;
    return JSON.stringify(data);
  } catch (error) {
    console.error('Erro ao converter JSON:', error.message);
    return null;
  }
};

export const decryptTemp = (data) => {
  try {
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
};

// ================================================================
// 3. VERIFICAR SE crypto-js ESTÁ INSTALADO CORRETAMENTE
// ================================================================
// Execute no terminal:
// npm uninstall crypto-js
// npm install crypto-js
// 
// OU para Expo:
// expo install crypto-js

// ================================================================
// 4. TESTAR SE A CRIPTOGRAFIA FUNCIONA
// ================================================================
// Adicione este teste no seu componente (TEMPORÁRIO):

const testCrypto = () => {
  console.log('🧪 Testando criptografia...');
  
  const testData = { nome: 'Teste', id: 123 };
  console.log('Dados originais:', testData);
  
  const encrypted = encrypt(testData);
  console.log('Dados criptografados:', encrypted);
  
  if (encrypted) {
    const decrypted = decrypt(encrypted);
    console.log('Dados descriptografados:', decrypted);
    
    if (JSON.stringify(testData) === JSON.stringify(decrypted)) {
      console.log('✅ Criptografia funcionando!');
    } else {
      console.log('❌ Erro na descriptografia');
    }
  } else {
    console.log('❌ Erro na criptografia');
  }
};

// Chame uma vez: testCrypto();

// ================================================================
// 5. IDENTIFICAR ONDE O ERRO ESTÁ ACONTECENDO
// ================================================================
// Adicione logs temporários para identificar qual dados estão causando erro:

const encryptWithDebug = (data, context = 'unknown') => {
  console.log(`🔍 Tentando criptografar [${context}]:`, typeof data);
  
  const result = encrypt(data);
  
  if (result) {
    console.log(`✅ Criptografia bem-sucedida [${context}]`);
  } else {
    console.log(`❌ Falha na criptografia [${context}]`);
    console.log('Dados que falharam:', data);
  }
  
  return result;
};

// ================================================================
// 6. POSSÍVEIS CAUSAS DO ERRO:
// ================================================================

// CAUSA 1: Dados circulares
// SOLUÇÃO: Verificar se userData tem referências circulares

// CAUSA 2: Dados muito grandes
// SOLUÇÃO: Verificar tamanho dos dados

// CAUSA 3: crypto-js mal instalado
// SOLUÇÃO: Reinstalar crypto-js

// CAUSA 4: Dados com tipos especiais (Date, etc)
// SOLUÇÃO: Limpar dados antes de criptografar

// ================================================================
// 7. VERSÃO ALTERNATIVA COM LIMPEZA DE DADOS
// ================================================================
const cleanData = (obj) => {
  try {
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      // Limpar tipos problemáticos
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'function') {
        return undefined;
      }
      if (value === undefined) {
        return null;
      }
      return value;
    }));
  } catch (error) {
    console.error('Erro ao limpar dados:', error.message);
    return null;
  }
};

export const encryptSafe = (data) => {
  try {
    const cleanedData = cleanData(data);
    if (!cleanedData) return null;
    
    return encrypt(cleanedData);
  } catch (error) {
    console.error('Erro na criptografia segura:', error.message);
    return null;
  }
};

// ================================================================
// PASSOS PARA RESOLVER:
// ================================================================
// 1. Substitua a função encrypt() pela versão melhorada acima
// 2. Execute testCrypto() para ver se funciona
// 3. Se não funcionar, use encryptTemp/decryptTemp temporariamente
// 4. Verifique se crypto-js está instalado: npm list crypto-js
// 5. Me diga qual erro específico aparece no teste
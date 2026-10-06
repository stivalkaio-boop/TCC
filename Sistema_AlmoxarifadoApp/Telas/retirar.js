import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Navbar from '../componentes/Navbar';
import { API_URL } from '../config';

export default function Movimentar({ navigation, route }) {
  // "nome" aqui é o nome do USUÁRIO logado (vem do login)
  const { nome: usuario, tipo } = route.params;

  const [operacao, setOperacao] = useState('Entrada'); // 'Entrada' ou 'Saida'
  const [nomeItem, setNomeItem] = useState('');
  const [categoria, setCategoria] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!nomeItem.trim() || !quantidade || Number(quantidade) <= 0) {
      Alert.alert('Atenção', 'Informe o nome do item e uma quantidade maior que zero.');
      return;
    }

    setEnviando(true);
    try {
      const response = await fetch(`${API_URL}/api/movimentacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operacao,
          nome: nomeItem.trim(),
          quantidade: Number(quantidade),
        }),
      });

      const texto = await response.text();
      let data = null;
      try {
        data = JSON.parse(texto);
      } catch (erroJson) {
        data = null;
      }

      if (response.ok && data) {
        setNomeItem('');
        setCategoria('');
        setQuantidade('');

        Alert.alert(
          'Sucesso',
          `${operacao === 'Entrada' ? 'Entrada' : 'Saída'} registrada! Estoque atual: ${data.estoque_atual}`,
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Itens', { nome: usuario, tipo }),
            },
          ]
        );
      } else if (data) {
        Alert.alert('Erro', data.erro || 'Não foi possível registrar a movimentação.');
      } else {
        Alert.alert(
          'Erro no servidor',
          `Código ${response.status}. Veja a mensagem de erro no terminal do Flask.`
        );
      }
    } catch (e) {
      Alert.alert(
        'Erro de conexão',
        'Não foi possível conectar ao servidor.\n\n' + String(e.message || e)
      );
    } finally {
      setEnviando(false);
    }
  };

  const voltar = () =>
    navigation.navigate(tipo === 'admin' ? 'Inicial' : 'InicialUsuario', {
      nome: usuario,
      tipo,
    });

  return (
    <View style={styles.container}>
      <Navbar navigation={navigation} nome={usuario} tipo={tipo} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.conteudo}
          keyboardShouldPersistTaps="handled"
        >
          {/* quadro branco */}
          <View style={styles.quadro}>
            {/* seletor Entrada / Saída (no lugar do <select> do site) */}
            <View style={styles.seletor}>
              <Pressable
                style={[
                  styles.opcao,
                  operacao === 'Entrada' && styles.opcaoAtiva,
                ]}
                onPress={() => setOperacao('Entrada')}
              >
                <Text
                  style={[
                    styles.textoOpcao,
                    operacao === 'Entrada' && styles.textoOpcaoAtiva,
                  ]}
                >
                  Entrada
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.opcao,
                  operacao === 'Saida' && styles.opcaoAtiva,
                ]}
                onPress={() => setOperacao('Saida')}
              >
                <Text
                  style={[
                    styles.textoOpcao,
                    operacao === 'Saida' && styles.textoOpcaoAtiva,
                  ]}
                >
                  Saída
                </Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Nome do item:</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do item"
              placeholderTextColor="#8a8a8a"
              value={nomeItem}
              onChangeText={setNomeItem}
            />

            <Text style={styles.label}>Categoria:</Text>
            <TextInput
              style={styles.input}
              placeholder="Categoria do item"
              placeholderTextColor="#8a8a8a"
              value={categoria}
              onChangeText={setCategoria}
            />

            <Text style={styles.label}>Quantidade:</Text>
            <TextInput
              style={styles.input}
              placeholder="Quantidade"
              placeholderTextColor="#8a8a8a"
              keyboardType="number-pad"
              value={quantidade}
              onChangeText={(t) => setQuantidade(t.replace(/[^0-9]/g, ''))}
            />
          </View>

          {/* botão fica fora do quadro, como no site */}
          <Pressable
            style={({ pressed }) => [
              styles.botaoRetirar,
              (pressed || enviando) && styles.botaoRetirarPressionado,
            ]}
            onPress={enviar}
            disabled={enviando}
          >
            {enviando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.textoBotaoRetirar}>Retire seu item</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.botaoVoltar,
              pressed && styles.botaoVoltarPressionado,
            ]}
            onPress={voltar}
          >
            <Text style={styles.textoVoltar}>← Voltar para a tela de Início</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#192a6b',
  },
  conteudo: {
    padding: 20,
    paddingBottom: 40,
  },

  // quadro branco
  quadro: {
    backgroundColor: '#fffafa',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  label: {
    fontSize: 14,
    color: '#000',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#767676',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#000',
  },

  // seletor Entrada / Saída
  seletor: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#767676',
    borderRadius: 6,
    overflow: 'hidden',
  },
  opcao: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#efefef',
  },
  opcaoAtiva: {
    backgroundColor: '#1c2c6e',
  },
  textoOpcao: {
    fontSize: 15,
    color: '#000',
  },
  textoOpcaoAtiva: {
    color: '#fff',
    fontWeight: 'bold',
  },

  // botão retirar
  botaoRetirar: {
    alignSelf: 'flex-start',
    minWidth: 150,
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#ff9500',
    borderWidth: 1,
    borderColor: '#2f6fd6',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  botaoRetirarPressionado: {
    backgroundColor: '#e68600',
  },
  textoBotaoRetirar: {
    color: '#fff',
    fontSize: 15,
  },

  // botão voltar
  botaoVoltar: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff9500',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginTop: 30,
  },
  botaoVoltarPressionado: {
    backgroundColor: '#e68600',
  },
  textoVoltar: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
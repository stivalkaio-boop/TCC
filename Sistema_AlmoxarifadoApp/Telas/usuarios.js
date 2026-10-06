import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
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

export default function CadastrarUsuario({ navigation, route }) {
  // dados do usuário logado (vêm do login)
  const { nome: usuario, tipo } = route.params;

  const [nomeUsuario, setNomeUsuario] = useState('');
  const [senhaUsuario, setSenhaUsuario] = useState('');
  const [tipoConta, setTipoConta] = useState('user'); // 'user' ou 'admin'
  const [enviando, setEnviando] = useState(false);

  const cadastrar = async () => {
    if (!nomeUsuario.trim() || !senhaUsuario) {
      Alert.alert('Atenção', 'Informe o nome e a senha do usuário.');
      return;
    }

    setEnviando(true);
    try {
      const response = await fetch(`${API_URL}/api/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nome: nomeUsuario.trim(),
          senha: senhaUsuario,
          tipo: tipoConta,
        }),
      });

      const texto = await response.text();
      let data = null;
      try {
        data = JSON.parse(texto);
      } catch (erroJson) {
        data = null;
      }

      if (response.ok) {
        setNomeUsuario('');
        setSenhaUsuario('');
        setTipoConta('user');
        Alert.alert('Sucesso', 'Usuário cadastrado com sucesso!');
      } else if (data) {
        Alert.alert('Erro', data.erro || 'Não foi possível cadastrar o usuário.');
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

      <ImageBackground
        source={require('../assets/Lamine.jpeg')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.conteudo}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.quadro}>
              <Text style={styles.titulo}>Cadastrar Novo Usuario</Text>

              <TextInput
                style={styles.input}
                placeholder="Nome do Usuario"
                placeholderTextColor="#8a8a8a"
                value={nomeUsuario}
                onChangeText={setNomeUsuario}
                autoCapitalize="none"
              />

              <TextInput
                style={styles.input}
                placeholder="Senha do usuario"
                placeholderTextColor="#8a8a8a"
                secureTextEntry
                value={senhaUsuario}
                onChangeText={setSenhaUsuario}
              />

              <Text style={styles.label}>Tipo de Conta:</Text>
              <View style={styles.seletor}>
                <Pressable
                  style={[styles.opcao, tipoConta === 'user' && styles.opcaoAtiva]}
                  onPress={() => setTipoConta('user')}
                >
                  <Text
                    style={[
                      styles.textoOpcao,
                      tipoConta === 'user' && styles.textoOpcaoAtiva,
                    ]}
                  >
                    Usuário
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.opcao, tipoConta === 'admin' && styles.opcaoAtiva]}
                  onPress={() => setTipoConta('admin')}
                >
                  <Text
                    style={[
                      styles.textoOpcao,
                      tipoConta === 'admin' && styles.textoOpcaoAtiva,
                    ]}
                  >
                    Administrador
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.botaoCadastrar,
                  (pressed || enviando) && styles.botaoCadastrarPressionado,
                ]}
                onPress={cadastrar}
                disabled={enviando}
              >
                {enviando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.textoBotao}>Cadastrar</Text>
                )}
              </Pressable>
            </View>

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
      </ImageBackground>

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
    flexGrow: 1,
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 40,
  },
  quadro: {
    backgroundColor: 'rgba(255, 250, 250, 0.95)',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  titulo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#222',
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#000',
    marginTop: 4,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#767676',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#000',
    marginBottom: 16,
  },

  // seletor Usuário / Administrador (no lugar do <select>)
  seletor: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#767676',
    borderRadius: 8,
    overflow: 'hidden',
  },
  opcao: {
    flex: 1,
    paddingVertical: 12,
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

  botaoCadastrar: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 14,
    backgroundColor: '#ff9500',
    borderRadius: 8,
  },
  botaoCadastrarPressionado: {
    backgroundColor: '#e68600',
  },
  textoBotao: {
    color: '#fff',
    fontSize: 16,
  },

  botaoVoltar: {
    alignSelf: 'flex-start',
    backgroundColor: '#1c2c6e',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginTop: 30,
  },
  botaoVoltarPressionado: {
    backgroundColor: '#142059',
  },
  textoVoltar: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
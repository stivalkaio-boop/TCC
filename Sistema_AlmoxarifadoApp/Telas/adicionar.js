import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import Navbar from '../componentes/Navbar';
import { API_URL } from '../config';

export default function Adicionar({ navigation, route }) {
  // "nome" aqui é o nome do USUÁRIO logado (vem do login)
  const { nome: usuario, tipo } = route.params;

  const [nomeItem, setNomeItem] = useState('');
  const [categoria, setCategoria] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState('');
  const [foto, setFoto] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const escolherFoto = async () => {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });

    if (!resultado.canceled) {
      setFoto(resultado.assets[0]);
    }
  };

  const adicionar = async () => {
    if (!nomeItem.trim()) {
      Alert.alert('Atenção', 'Informe o nome do item.');
      return;
    }

    // JSON: campos de texto + a foto em base64 (se tiver)
    const dados = {
      nome: nomeItem.trim(),
      categoria: categoria.trim(),
      quantidade: quantidade || '0',
      preco: preco || '0',
    };

    if (foto && foto.base64) {
      dados.foto_base64 = foto.base64;
      dados.foto_nome = foto.fileName || foto.uri.split('/').pop() || 'foto.jpg';
    }

    setEnviando(true);
    try {
      const response = await fetch(`${API_URL}/api/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dados),
      });
      // lê como texto primeiro: se o Flask devolver uma página de erro (HTML),
      // não dá para tratar como JSON
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
        setPreco('');
        setFoto(null);

        // igual ao site: depois de salvar, vai para a lista de itens
        Alert.alert('Sucesso', 'Item cadastrado!', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Itens', { nome: usuario, tipo }),
          },
        ]);
      } else if (data) {
        Alert.alert('Erro', data.erro || 'Não foi possível cadastrar o item.');
      } else {
        // o servidor respondeu, mas não com JSON (provavelmente um erro no Flask)
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
            <Text style={styles.titulo}>Novo Item</Text>

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

            <Text style={styles.label}>Preço do item:</Text>
            <TextInput
              style={styles.input}
              placeholder="Preço"
              placeholderTextColor="#8a8a8a"
              keyboardType="decimal-pad"
              value={preco}
              onChangeText={setPreco}
            />

            <Text style={styles.label}>Foto do seu Item:</Text>
            <View style={styles.linhaFoto}>
              <Pressable style={styles.botaoArquivo} onPress={escolherFoto}>
                <Text style={styles.textoArquivo}>Escolher arquivo</Text>
              </Pressable>
              <Text style={styles.nomeArquivo} numberOfLines={1}>
                {foto
                  ? foto.fileName || foto.uri.split('/').pop()
                  : 'Nenhum arquivo escolhido'}
              </Text>
            </View>

            {foto && (
              <Image
                source={{ uri: foto.uri }}
                style={styles.previa}
                resizeMode="contain"
              />
            )}

            <Pressable
              style={({ pressed }) => [
                styles.botaoAdicionar,
                (pressed || enviando) && styles.botaoAdicionarPressionado,
              ]}
              onPress={adicionar}
              disabled={enviando}
            >
              {enviando ? (
                <ActivityIndicator color="#222" />
              ) : (
                <Text style={styles.textoAdicionar}>Adicionar novo item</Text>
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
  titulo: {
    fontSize: 24,
    color: '#000',
    marginBottom: 12,
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

  // foto
  linhaFoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  botaoArquivo: {
    backgroundColor: '#efefef',
    borderWidth: 1,
    borderColor: '#767676',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  textoArquivo: {
    fontSize: 14,
    color: '#000',
  },
  nomeArquivo: {
    flex: 1,
    fontSize: 13,
    color: '#000',
  },
  previa: {
    width: '100%',
    height: 150,
    marginTop: 12,
  },

  // botão adicionar
  botaoAdicionar: {
    alignSelf: 'center',
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#ff9500',
    borderWidth: 1,
    borderColor: '#2f6fd6',
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  botaoAdicionarPressionado: {
    backgroundColor: '#e68600',
  },
  textoAdicionar: {
    color: '#222',
    fontSize: 15,
    textAlign: 'center',
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
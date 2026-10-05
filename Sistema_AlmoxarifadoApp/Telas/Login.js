import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TextInput,
  Pressable,
  Alert,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { API_URL } from '../config';

// ---------------------------------------------------------------
// AJUSTES DA IMAGEM DE FUNDO
// ZOOM: 1 = preenche a tela toda (é o mínimo; valores menores viram 1,
//       para não aparecer faixa azul). Maior que 1 = aproxima a imagem.
// DESLOCAR_X: positivo empurra a imagem para a DIREITA (Neymar vai
//       para o centro), negativo empurra para a esquerda.
// DESLOCAR_Y: positivo empurra para baixo, negativo para cima.
// ---------------------------------------------------------------
const ZOOM = 1;
const DESLOCAR_X = 4;
const DESLOCAR_Y = 0.45;

const IMAGEM_FUNDO = require('../assets/NEYMAR1.jpeg');
const fonte = Image.resolveAssetSource(IMAGEM_FUNDO);

export default function Login({ navigation }) {
  const janela = useWindowDimensions();

  // tamanho REAL da área da tela (medido), pois a altura da janela
  // pode ser menor que a área visível e deixar uma faixa azul embaixo
  const [tamanho, setTamanho] = useState(null);
  const width = tamanho ? tamanho.width : janela.width;
  const height = tamanho ? tamanho.height : janela.height;
  const telaGrande = width >= 768; // tablet/web: imagem 60% + form à direita

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // --- cálculo da posição da imagem de fundo ---
  const areaLargura = telaGrande ? width * 0.6 : width;
  const escalaCover = Math.max(areaLargura / fonte.width, height / fonte.height);
  const escala = escalaCover * Math.max(ZOOM, 1);
  const imgLargura = fonte.width * escala;
  const imgAltura = fonte.height * escala;

  let imgEsquerda = (areaLargura - imgLargura) / 2 + DESLOCAR_X;
  // impede que apareça faixa vazia nas laterais quando a imagem é mais larga que a área
  if (imgLargura >= areaLargura) {
    imgEsquerda = Math.min(0, Math.max(areaLargura - imgLargura, imgEsquerda));
  }
  let imgTopo = (height - imgAltura) / 2 + DESLOCAR_Y;
  // impede faixa vazia em cima/embaixo
  if (imgAltura >= height) {
    imgTopo = Math.min(0, Math.max(height - imgAltura, imgTopo));
  }

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Atenção', 'Preencha usuário e senha.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nome: username, senha: password }),
      });

      const data = await response.json();

      if (response.ok) {
        // admin vai para a INICIAL, os demais para a inicial do usuário
        // (igual ao que o Flask faz: painel / painel_usuario)
        const destino = data.tipo === 'admin' ? 'Inicial' : 'InicialUsuario';
        navigation.replace(destino, { nome: data.nome, tipo: data.tipo });
      } else {
        Alert.alert('Erro', data.erro || 'Usuário ou senha incorretos');
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível conectar ao servidor.');
    }
  };

  return (
    <View
      style={styles.fundo}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        // guarda sempre o maior tamanho (o teclado aberto diminui a altura e não deve mexer na imagem)
        setTamanho((anterior) =>
          anterior && anterior.width === w && anterior.height >= h
            ? anterior
            : { width: w, height: h }
        );
      }}
    >
      {/* imagem do fundo */}
      <View style={[styles.areaImagem, { width: areaLargura }]}>
        <Image
          source={IMAGEM_FUNDO}
          style={{
            position: 'absolute',
            width: imgLargura,
            height: imgAltura,
            left: imgEsquerda,
            top: imgTopo,
          }}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.lado,
          telaGrande ? styles.ladoDireita : styles.ladoCentro,
        ]}
      >
        {/* caixa azul */}
        <View style={styles.formulario}>
          {/* logo */}
          <Image
            source={require('../assets/logo1.jpeg')}
            style={styles.logo}
            resizeMode="contain"
          />

          {/* texto */}
          <Text style={styles.textoLogin}>Bem vindo ao Sistema Almoxarifado!</Text>

          <View style={styles.campo}>
            <TextInput
              style={styles.input}
              placeholder="Digite seu nome"
              placeholderTextColor="#757575"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.campo}>
            <TextInput
              style={styles.input}
              placeholder="Digite sua senha"
              placeholderTextColor="#757575"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <Pressable
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.botao,
              pressed && styles.botaoPressionado,
            ]}
          >
            <Text style={styles.textoBotao}>Entrar</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: '#192a6b',
    overflow: 'hidden',
  },
  areaImagem: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    overflow: 'hidden',
  },
  lado: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ladoDireita: {
    right: '8%',
  },
  ladoCentro: {
    left: 0,
    right: 0,
  },
  logo: {
    width: 180,
    height: 55,
    alignSelf: 'center',
  },
  textoLogin: {
    width: '100%',
    fontWeight: '600',
    color: '#ddd',
    fontSize: 17.5,
    textAlign: 'center',
  },
  formulario: {
    width: 400,
    maxWidth: '90%',
    backgroundColor: 'rgba(25, 42, 107, 0.9)',
    padding: 40,
    borderRadius: 20,
    gap: 20,
  },
  campo: {
    width: '100%',
  },
  input: {
    width: '100%',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    fontSize: 15,
  },
  botao: {
    backgroundColor: '#ff9500',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  botaoPressionado: {
    backgroundColor: '#e68600', // equivalente ao :hover
  },
  textoBotao: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
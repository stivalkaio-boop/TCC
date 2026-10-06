import { StatusBar } from 'expo-status-bar';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import Navbar from '../componentes/Navbar';

// Mesma imagem de fundo da tela inicial do admin
const IMAGEM_FUNDO = require('../assets/fundologin1.jpeg');

export default function InicialUsuario({ navigation, route }) {
  const { nome, tipo } = route.params;

  return (
    <View style={styles.container}>
      {/* fundo desfocado */}
      <Image
        source={IMAGEM_FUNDO}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        blurRadius={8}
      />

      {/* o menu já esconde "Cadastrar Usuários" quando o tipo não é admin */}
      <Navbar navigation={navigation} nome={nome} tipo={tipo} />

      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.boasVindas}>Bem vindo {nome}!</Text>
      </ScrollView>

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
  },
  boasVindas: {
    color: '#fff',
    fontSize: 26,
  },
});
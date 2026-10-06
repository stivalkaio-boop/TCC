import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Navbar from '../componentes/Navbar';
import { API_URL } from '../config';

// Imagem de fundo (copie a foto da fábrica da pasta static do site para a pasta assets)
const IMAGEM_FUNDO = require('../assets/fundologin1.jpeg');

export default function Inicial({ navigation, route }) {
  const { nome, tipo } = route.params;

  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // busca a lista de usuários no Flask
  useEffect(() => {
    const carregarUsuarios = async () => {
      try {
        const response = await fetch(`${API_URL}/api/usuarios`, {
          credentials: 'include',
        });
        const data = await response.json();

        if (response.ok) {
          setUsuarios(data);
        } else {
          setErro(data.erro || 'Erro ao buscar usuários.');
        }
      } catch (e) {
        setErro('Não foi possível conectar ao servidor.');
      } finally {
        setCarregando(false);
      }
    };

    carregarUsuarios();
  }, []);

  return (
    <View style={styles.container}>
      {/* fundo desfocado */}
      <Image
        source={IMAGEM_FUNDO}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        blurRadius={8}
      />

      <Navbar navigation={navigation} nome={nome} tipo={tipo} />

      {/* conteúdo */}
      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.boasVindas}>Bem vindo {nome}!</Text>

        <Text style={styles.titulo}>Usuários Cadastrados</Text>

        {carregando && <ActivityIndicator size="large" color="#fff" />}

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        {!carregando && !erro && (
          <View style={styles.tabela}>
            <View style={styles.linhaCabecalho}>
              <Text style={[styles.celulaCabecalho, styles.colunaId]}>ID</Text>
              <Text style={[styles.celulaCabecalho, styles.coluna]}>Nome</Text>
              <Text style={[styles.celulaCabecalho, styles.coluna]}>Tipo</Text>
            </View>

            {usuarios.map((u) => (
              <View key={u.id} style={styles.linha}>
                <Text style={[styles.celula, styles.colunaId]}>{u.id}</Text>
                <Text style={[styles.celula, styles.coluna]}>{u.nome}</Text>
                <Text style={[styles.celula, styles.coluna]}>{u.tipo}</Text>
              </View>
            ))}
          </View>
        )}
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
    paddingBottom: 40,
  },
  boasVindas: {
    color: '#fff',
    fontSize: 26,
    marginBottom: 24,
  },
  titulo: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 14,
  },
  erro: {
    color: '#fff',
    backgroundColor: 'rgba(200, 30, 30, 0.85)',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
  },


  tabela: {
    width: '100%',
  },

  linhaCabecalho: {
    flexDirection: 'row',
    backgroundColor: '#1c2c6e',
    paddingVertical: 14,
  },
  linha: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#1c2c6e',
  },
  colunaId: {
    flex: 0.6,
    textAlign: 'center',
  },
  coluna: {
    flex: 1,
    textAlign: 'center',
  },
  celulaCabecalho: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  celula: {
    color: '#222',
    fontSize: 14,
  },

});
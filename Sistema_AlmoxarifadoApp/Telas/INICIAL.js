import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { API_URL } from '../config';

// Imagem de fundo (copie a foto da fábrica da pasta static do site para a pasta assets)
const IMAGEM_FUNDO = require('../assets/fundologin1.jpeg');

export default function Inicial({ navigation, route }) {
  const { nome } = route.params;
  const insets = useSafeAreaInsets();

  const [menuAberto, setMenuAberto] = useState(false);
  const [cadastrarAberto, setCadastrarAberto] = useState(false);
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

        if (data.ok) {
          setUsuarios(data.usuarios);
        } else {
          setErro(data.mensagem);
        }
      } catch (e) {
        setErro('Não foi possível conectar ao servidor.');
      } finally {
        setCarregando(false);
      }
    };

    carregarUsuarios();
  }, []);

  // as outras telas ainda não existem no app: troque pelo navigation.navigate('NomeDaTela')
  const abrir = (titulo) => {
    setMenuAberto(false);
    Alert.alert(titulo, 'Esta tela ainda será criada no app.');
  };

  const sair = () => {
    setMenuAberto(false);
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      {/* fundo desfocado */}
      <Image
        source={require('../assets/fundologin1.jpeg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        blurRadius={8}
      />

      {/* navbar */}
      <View style={[styles.navbar, { paddingTop: insets.top + 10 }]}>
        <Image
          source={require('../assets/logo1.jpeg')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Pressable onPress={() => setMenuAberto(true)} hitSlop={10}>
          <Ionicons name="menu" size={30} color="#fff" />
        </Pressable>
      </View>

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
              <Text style={[styles.celulaCabecalho, styles.coluna]}>Senha</Text>
              <Text style={[styles.celulaCabecalho, styles.coluna]}>Tipo</Text>
            </View>

            {usuarios.map((u) => (
              <View key={u.id} style={styles.linha}>
                <Text style={[styles.celula, styles.colunaId]}>{u.id}</Text>
                <Text style={[styles.celula, styles.coluna]}>{u.nome}</Text>
                <Text style={[styles.celula, styles.coluna]}>{u.senha}</Text>
                <Text style={[styles.celula, styles.coluna]}>{u.tipo}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* menu da navbar */}
      <Modal
        visible={menuAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuAberto(false)}
      >
        <Pressable style={styles.fundoMenu} onPress={() => setMenuAberto(false)}>
          <View style={[styles.menu, { marginTop: insets.top + 60 }]}>
            <Pressable style={styles.itemMenu} onPress={() => abrir('Itens')}>
              <Ionicons name="home" size={20} color="#fff" />
              <Text style={styles.textoMenu}>Itens</Text>
            </Pressable>

            <Pressable
              style={styles.itemMenu}
              onPress={() => setCadastrarAberto(!cadastrarAberto)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={[styles.textoMenu, { flex: 1 }]}>Cadastrar</Text>
              <Ionicons
                name={cadastrarAberto ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#fff"
              />
            </Pressable>

            {cadastrarAberto && (
              <View style={styles.subMenu}>
                <Pressable style={styles.itemMenu} onPress={() => abrir('Adicionar')}>
                  <Text style={styles.textoSubMenu}>Adicionar</Text>
                </Pressable>
                <Pressable style={styles.itemMenu} onPress={() => abrir('Retirar')}>
                  <Text style={styles.textoSubMenu}>Retirar</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={styles.itemMenu} onPress={() => abrir('Relatório')}>
              <Ionicons name="document-text" size={20} color="#fff" />
              <Text style={styles.textoMenu}>Relatório</Text>
            </Pressable>

            <Pressable
              style={styles.itemMenu}
              onPress={() => abrir('Cadastrar Usuários')}
            >
              <Ionicons name="person" size={20} color="#fff" />
              <Text style={styles.textoMenu}>Cadastrar Usuários</Text>
            </Pressable>

            <Pressable style={[styles.itemMenu, styles.itemSair]} onPress={sair}>
              <Ionicons name="log-out" size={20} color="#ff9500" />
              <Text style={[styles.textoMenu, { color: '#ff9500' }]}>Sair</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#192a6b',
  },

  // navbar
  navbar: {
    backgroundColor: '#1c2c6e',
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    width: 110,
    height: 34,
  },

  // conteúdo
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

  // tabela
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

  // menu
  fundoMenu: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'flex-end',
  },
  menu: {
    width: 240,
    marginRight: 12,
    backgroundColor: '#1c2c6e',
    borderRadius: 14,
    paddingVertical: 6,
  },
  itemMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  textoMenu: {
    color: '#fff',
    fontSize: 16,
  },
  subMenu: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingLeft: 32,
  },
  textoSubMenu: {
    color: '#fff',
    fontSize: 15,
  },
  itemSair: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
});
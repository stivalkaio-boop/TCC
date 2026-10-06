import { useCallback, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import Navbar from '../componentes/Navbar';
import { API_URL } from '../config';

const IMAGEM_FUNDO = require('../assets/fundologin1.jpeg');

// 12.5 -> "R$ 12,50"
function formatarPreco(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return String(valor ?? '');
  return 'R$ ' + numero.toFixed(2).replace('.', ',');
}

export default function Itens({ navigation, route }) {
  const { nome, tipo } = route.params;

  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [fotoAberta, setFotoAberta] = useState(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const response = await fetch(`${API_URL}/api/itens`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (response.ok) {
        setItens(data);
      } else {
        setErro(data.erro || 'Erro ao buscar os itens.');
      }
    } catch (e) {
      setErro('Não foi possível conectar ao servidor.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  // recarrega sempre que a tela aparece (ex.: ao voltar de outra tela)
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  const aoPuxar = () => {
    setAtualizando(true);
    carregar();
  };

  // o Flask guarda a foto como "static/arquivo.png"
  const abrirFoto = (foto) => setFotoAberta(`${API_URL}/${foto}`);

  const voltar = () =>
    navigation.navigate(tipo === 'admin' ? 'Inicial' : 'InicialUsuario', {
      nome,
      tipo,
    });

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

      <ScrollView
        contentContainerStyle={styles.conteudo}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={aoPuxar}
            tintColor="#fff"
            colors={['#ff9500']}
          />
        }
      >
        {carregando && <ActivityIndicator size="large" color="#fff" />}

        {!!erro && <Text style={styles.erro}>{erro}</Text>}

        {!carregando && !erro && (
          <View style={styles.tabela}>
            <View style={styles.linhaCabecalho}>
              <Text style={[styles.celulaCabecalho, styles.colId]}>ID</Text>
              <Text style={[styles.celulaCabecalho, styles.colNome]}>Nome</Text>
              <Text style={[styles.celulaCabecalho, styles.colCategoria]}>Categoria</Text>
              <Text style={[styles.celulaCabecalho, styles.colEstoque]}>Estoque</Text>
              <Text style={[styles.celulaCabecalho, styles.colPreco]}>Preço</Text>
              <Text style={[styles.celulaCabecalho, styles.colFoto]}>Imagem</Text>
            </View>

            {itens.length === 0 && (
              <View style={styles.linha}>
                <Text style={[styles.celula, { flex: 1 }]}>Nenhum item cadastrado.</Text>
              </View>
            )}

            {itens.map((item) => (
              <View key={item.id} style={styles.linha}>
                <Text style={[styles.celula, styles.colId]}>{item.id}</Text>
                <Text style={[styles.celula, styles.colNome]}>{item.nome}</Text>
                <Text style={[styles.celula, styles.colCategoria]}>{item.categoria}</Text>
                <Text style={[styles.celula, styles.colEstoque]}>
                  {item.quantidade_estoque}
                </Text>
                <Text style={[styles.celula, styles.colPreco]}>
                  {formatarPreco(item.preco_unitario)}
                </Text>

                <View style={styles.colFoto}>
                  {item.foto ? (
                    <Pressable
                      style={styles.botaoFoto}
                      onPress={() => abrirFoto(item.foto)}
                    >
                      <Text style={styles.textoBotaoFoto}>Foto</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.celula}>-</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.botaoVoltar, pressed && styles.botaoVoltarPressionado]}
          onPress={voltar}
        >
          <Text style={styles.textoBotaoVoltar}>Voltar para a tela de Início</Text>
        </Pressable>
      </ScrollView>

      {/* foto do item (equivalente ao Swal.fire do site) */}
      <Modal
        visible={!!fotoAberta}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoAberta(null)}
      >
        <Pressable style={styles.fundoFoto} onPress={() => setFotoAberta(null)}>
          <View style={styles.caixaFoto}>
            {!!fotoAberta && (
              <Image
                source={{ uri: fotoAberta }}
                style={styles.foto}
                resizeMode="contain"
              />
            )}
            <Pressable style={styles.fechar} onPress={() => setFotoAberta(null)} hitSlop={10}>
              <Ionicons name="close" size={26} color="#333" />
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
  conteudo: {
    padding: 12,
    paddingTop: 20,
    paddingBottom: 40,
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
    alignItems: 'center',
    backgroundColor: '#1c2c6e',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#1c2c6e',
  },
  colId: { flex: 0.5, textAlign: 'center' },
  colNome: { flex: 1.5, textAlign: 'center' },
  colCategoria: { flex: 1.3, textAlign: 'center' },
  colEstoque: { flex: 1, textAlign: 'center' },
  colPreco: { flex: 1.2, textAlign: 'center' },
  colFoto: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  celulaCabecalho: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11.5,
  },
  celula: {
    color: '#222',
    fontSize: 12,
  },
  botaoFoto: {
    backgroundColor: '#ff9500',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  textoBotaoFoto: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // botão voltar
  botaoVoltar: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff9500',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 24,
  },
  botaoVoltarPressionado: {
    backgroundColor: '#e68600',
  },
  textoBotaoVoltar: {
    color: '#fff',
    fontWeight: 'bold',
  },

  // foto em tela cheia
  fundoFoto: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  caixaFoto: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  foto: {
    width: '100%',
    height: 320,
  },
  fechar: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
});
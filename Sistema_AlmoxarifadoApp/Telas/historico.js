import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { API_URL } from '../config';
import Navbar from '../componentes/Navbar';

// Cor de cada tipo (equivale às classes entrada, saida, cadastro... do CSS)
const CORES_TIPO = {
  'Entrada':             { bg: '#d4edda', texto: '#5caa4c' },
  'Saída':               { bg: '#f8d7da', texto: '#ac2532' },
  'Cadastro':            { bg: '#cce5ff', texto: '#22c9b3' },
  'Edição':              { bg: '#fff3cd', texto: '#837240' },
  'Exclusão':            { bg: '#f5c6cb', texto: '#af2735' },
  'Login':               { bg: '#e2e3e5', texto: '#000000' },
  'Cadastro de usuário': { bg: '#d1ecf1', texto: '#125c69' },
};
const COR_OUTRO = { bg: '#e2e3e5', texto: '#383d41' };

export default function Relatorio({ navigation, route }) {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  // a Navbar já envia nome e tipo ao navegar
  const nome = route?.params?.nome;
  const tipo = route?.params?.tipo;

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const resposta = await fetch(`${API_URL}/api/historico`, {
        credentials: 'include', // mantém a sessão do Flask
      });

      if (!resposta.ok) {
        setErro(`Erro ${resposta.status} ao buscar o histórico.`);
        setMovimentacoes([]);
        return;
      }

      const dados = await resposta.json();
      console.log('HISTORICO:', JSON.stringify(dados)); 

      const lista = Array.isArray(dados)
        ? dados
        : dados.movimentacoes || dados.historico || [];
      setMovimentacoes(lista);
    } catch (e) {
      setErro(`Falha: ${e.message}`);
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const voltar = () => {
    navigation.navigate(tipo === 'admin' ? 'Inicial' : 'InicialUsuario', { nome, tipo });
  };

  return (
    <View style={styles.tela}>
      <Navbar navigation={navigation} nome={nome} tipo={tipo} />

      <ScrollView
        contentContainerStyle={styles.conteudo}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              carregar();
            }}
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.titulo}>📋 Histórico de Movimentações - Almoxarifado</Text>

          {carregando ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 20 }} />
          ) : (
            // Rolagem horizontal, igual ao "tabela-scroll" do site
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                {/* Cabeçalho */}
                <View style={[styles.linha, styles.linhaCabecalho]}>
                  <Text style={[styles.cabecalho, styles.colId]}>ID</Text>
                  <Text style={[styles.cabecalho, styles.colItem]}>Item</Text>
                  <Text style={[styles.cabecalho, styles.colTipo]}>Tipo</Text>
                  <Text style={[styles.cabecalho, styles.colQtd]}>Quantidade</Text>
                  <Text style={[styles.cabecalho, styles.colUsuario]}>Usuário</Text>
                  <Text style={[styles.cabecalho, styles.colData]}>Data/Hora</Text>
                </View>

                {/* Linhas */}
                {movimentacoes.length === 0 ? (
                  <View style={[styles.linha, styles.linhaVazia]}>
                    <Text style={styles.celula}>
                      {erro || 'Nenhuma movimentação registrada.'}
                    </Text>
                  </View>
                ) : (
                  movimentacoes.map((linha) => {
                    const cor = CORES_TIPO[linha.tipo_movimentacao] || COR_OUTRO;
                    return (
                      <View key={linha.id} style={[styles.linha, styles.linhaDados]}>
                        <Text style={[styles.celula, styles.colId]}>{linha.id}</Text>
                        <Text style={[styles.celula, styles.colItem]}>
                          {linha.produto_nome || '-'}
                        </Text>
                        <View style={styles.colTipo}>
                          <View style={[styles.badge, { backgroundColor: cor.bg }]}>
                            <Text style={[styles.badgeTexto, { color: cor.texto }]}>
                              {linha.tipo_movimentacao}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.celula, styles.colQtd]}>{linha.quantidade}</Text>
                        <Text style={[styles.celula, styles.colUsuario]}>{linha.usuario}</Text>
                        <Text style={[styles.celula, styles.colData]}>
                          {linha.data_formatada || linha.data_movimentacao}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.botaoVoltar} onPress={voltar}>
        <Text style={styles.botaoVoltarTexto}>Voltar para a tela de Início</Text>
      </TouchableOpacity>
    </View>
  );
}

const AZUL = '#1c2d6b';

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#fff' },
  conteudo: { padding: 12 },
  card: {
    backgroundColor: AZUL,
    borderRadius: 8,
    padding: 12,
  },
  titulo: {
    color: '#e6e9f5',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },

  linha: { flexDirection: 'row', alignItems: 'center' },
  linhaCabecalho: { backgroundColor: AZUL, paddingVertical: 12 },
  linhaDados: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: AZUL,
  },
  linhaVazia: { backgroundColor: '#fff', paddingVertical: 16, justifyContent: 'center' },

  cabecalho: { color: '#fff', fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  celula: { color: '#222', fontSize: 13, textAlign: 'center' },

  // Larguras das colunas
  colId: { width: 50 },
  colItem: { width: 120 },
  colTipo: { width: 130, alignItems: 'center' },
  colQtd: { width: 100 },
  colUsuario: { width: 100 },
  colData: { width: 130 },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeTexto: { fontSize: 11, fontWeight: 'bold' },

  botaoVoltar: {
    backgroundColor: '#ff9a1f',
    borderRadius: 6,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  botaoVoltarTexto: { color: '#fff', fontSize: 15 },
});
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Navbar reutilizável: logo + botão de menu.
// Uso:  <Navbar navigation={navigation} nome={nome} tipo={tipo} />
export default function Navbar({ navigation, nome, tipo }) {
  const insets = useSafeAreaInsets();
  const [menuAberto, setMenuAberto] = useState(false);
  const [cadastrarAberto, setCadastrarAberto] = useState(false);

  // vai para uma tela que já existe no app
  const irPara = (tela) => {
    setMenuAberto(false);
    navigation.navigate(tela, { nome, tipo });
  };

  // telas que ainda não existem no app: troque por irPara('NomeDaTela') quando criar
  const emBreve = (titulo) => {
    setMenuAberto(false);
    Alert.alert(titulo, 'Esta tela ainda será criada no app.');
  };

  const sair = () => {
    setMenuAberto(false);
    navigation.replace('Login');
  };

  return (
    <>
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

      <Modal
        visible={menuAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuAberto(false)}
      >
        <Pressable style={styles.fundoMenu} onPress={() => setMenuAberto(false)}>
          <View style={[styles.menu, { marginTop: insets.top + 60 }]}>
            <Pressable style={styles.itemMenu} onPress={() => irPara('Itens')}>
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
                <Pressable style={styles.itemMenu} onPress={() => irPara('adicionar')}>
                  <Text style={styles.textoSubMenu}>Adicionar Novo Item</Text>
                </Pressable>
                <Pressable style={styles.itemMenu} onPress={() => emBreve('Movimentar')}>
                  <Text style={styles.textoSubMenu}>Movimentar</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={styles.itemMenu} onPress={() => emBreve('Relatório')}>
              <Ionicons name="document-text" size={20} color="#fff" />
              <Text style={styles.textoMenu}>Relatório</Text>
            </Pressable>

            {/* igual ao site: só o admin vê "Cadastrar Usuários" */}
            {tipo === 'admin' && (
              <Pressable
                style={styles.itemMenu}
                onPress={() => emBreve('Cadastrar Usuários')}
              >
                <Ionicons name="person" size={20} color="#fff" />
                <Text style={styles.textoMenu}>Cadastrar Usuários</Text>
              </Pressable>
            )}

            <Pressable style={[styles.itemMenu, styles.itemSair]} onPress={sair}>
              <Ionicons name="log-out" size={20} color="#ff9500" />
              <Text style={[styles.textoMenu, { color: '#ff9500' }]}>Sair</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
 
import Login from './Telas/Login';
import Inicial from './Telas/INICIAL';
import InicialUsuario from './Telas/inicial_usuario';
import Itens from './Telas/itens';
import adicionar from './Telas/adicionar';
import retirar from './Telas/retirar';
import usuarios from './Telas/usuarios';

const Stack = createNativeStackNavigator();
 
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Inicial" component={Inicial} />
        <Stack.Screen name="InicialUsuario" component={InicialUsuario} />
        <Stack.Screen name="Itens" component={Itens} />
        <Stack.Screen name="adicionar" component={adicionar} />
        <Stack.Screen name="retirar" component={retirar} />
        <Stack.Screen name="usuarios" component={usuarios}/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
 
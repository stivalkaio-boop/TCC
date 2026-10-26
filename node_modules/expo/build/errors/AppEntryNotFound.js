import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { StyleSheet, Text, View } from 'react-native';
export function AppEntryNotFound() {
    return /*#__PURE__*/ _jsxs(View, {
        style: styles.container,
        children: [
            /*#__PURE__*/ _jsx(Text, {
                style: styles.errorTitle,
                children: "App entry not found"
            }),
            /*#__PURE__*/ _jsx(Text, {
                style: styles.errorDescription,
                children: 'The app entry point named "main" was not registered. This may be due to an uncaught error thrown from a module\'s top-level code. Refer to the CLI logs and the native device logs for more detail.'
            })
        ]
    });
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
        backgroundColor: '#f2f2f2'
    },
    errorTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#d32f2f',
        textAlign: 'center',
        marginBottom: 24
    },
    errorDescription: {
        fontSize: 16,
        color: '#333',
        textAlign: 'center'
    }
});

//# sourceMappingURL=AppEntryNotFound.js.map

CREATE DATABASE almoxarifado;
USE almoxarifado;

CREATE TABLE Itens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(50),
    quantidade_estoque INT NOT NULL DEFAULT 0,
	preco_unitario DECIMAL(10,2) NOT NULL
);

INSERT INTO Itens (nome, categoria, quantidade_estoque, preco_unitario)
VALUES
('Martelo', 'Ferramentas', 50, 30.00),
('Parafuso', 'Ferramentas', 100, 1.50),
('Chave de fenda', 'Ferramentas', 75, 12.00);

SELECT * FROM itens;



CREATE DATABASE almoxarifado;
USE almoxarifado;

CREATE TABLE Itens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(50),
    quantidade_estoque INT NOT NULL DEFAULT 0,
	preco_unitario DECIMAL(10,2) NOT NULL,
    foto VARCHAR(255)
);

INSERT INTO Itens (nome, categoria, quantidade_estoque, preco_unitario, foto)
VALUES
('Martelo', 'Ferramentas', 50, 30.00),
('Parafuso', 'Ferramentas', 100, 1.50),
('Chave de fenda', 'Ferramentas', 75, 12.00),
('Alicate', 'Ferramentas', 25, 45.00),
('Jaleco', 'Ferramentas', 20, 50.00);

SELECT * FROM itens;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL
);
INSERT INTO usuarios (nome,senha,tipo)
VALUES
('admin', '1234','admin');

SELECT * FROM usuarios;

CREATE TABLE historico (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_nome VARCHAR(255) NOT NULL,
    tipo_movimentacao ENUM('Entrada', 'Saída') NOT NULL,
    quantidade INT NOT NULL,
    usuario VARCHAR(100) NOT NULL,
    data_movimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM historico;

DROP TABLE usuarios;
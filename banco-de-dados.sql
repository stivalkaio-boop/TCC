
USE almoxarifado;

CREATE TABLE itens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(50),
    quantidade_estoque INT NOT NULL DEFAULT 0,
	preco_unitario DECIMAL(10,2) NOT NULL,
    foto VARCHAR(255)
);

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

DROP TABLE IF EXISTS historico;
 
CREATE TABLE historico (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_nome VARCHAR(255) NOT NULL,
    tipo_movimentacao VARCHAR(50) NOT NULL,
    quantidade INT NOT NULL DEFAULT 0,
    usuario VARCHAR(100) NOT NULL,
    data_movimentacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_data_movimentacao (data_movimentacao)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE historico SET produto_nome = CONCAT('Novo usuário: ', produto_nome) WHERE id > 0 AND tipo_movimentacao = 'Cadastro de usuário' AND produto_nome NOT LIKE 'Novo usuário:%';
SELECT * FROM historico;
 
SELECT * FROM historico;

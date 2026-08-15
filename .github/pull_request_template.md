## 📋 Checklist do Pull Request

### Tipo de mudança
- [ ] 🐛 Bug fix
- [ ] ✨ Nova feature
- [ ] 🔄 Refatoração (sem mudança de comportamento)
- [ ] 📚 Documentação
- [ ] ⚙️ Configuração / DevOps
- [ ] 🔐 Segurança

---

### Antes de abrir o PR

#### Código
- [ ] O código compila sem erros TypeScript (`npx tsc --noEmit`)
- [ ] Os testes passam (`npm test`)
- [ ] Não há `console.log` esquecido no código de produção
- [ ] Nenhuma dependência desnecessária foi adicionada

#### Segurança
- [ ] **Nenhuma credencial, API key, secret ou token** foi commitado
- [ ] Arquivos `.env.local` e `.env*.local` estão no `.gitignore`
- [ ] Variáveis sensíveis são referenciadas via `process.env.NOME_DA_VARIAVEL`

#### Testes
- [ ] Funções novas têm testes unitários correspondentes
- [ ] Coverage não diminuiu em relação à branch `main`

#### UX / Produto
- [ ] A feature funciona em desktop e mobile
- [ ] Não há regressão visual visível
- [ ] Error boundaries estão protegendo novos componentes críticos

---

### Descrição das mudanças

<!-- Descreva o que foi feito e por quê. Inclua contexto relevante. -->

---

### Como testar

<!-- Passos para testar manualmente a mudança -->
1. 
2. 
3. 

---

### Screenshots (se aplicável)

<!-- Adicione capturas de tela de mudanças visuais -->

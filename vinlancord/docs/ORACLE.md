# Servidor grátis na Oracle Cloud (passo a passo, sem terminal)

Você cria a conta e a máquina clicando; **a instalação do Vinlancord é automática** (o script abaixo roda sozinho no primeiro boot). No fim, você só me manda o **IP público** da máquina.

> Custo: **R$ 0** dentro do plano *Always Free*. A Oracle pede um cartão só para confirmar identidade.

## 1. Criar a conta (uma vez)

1. Acesse **cloud.oracle.com** → **Sign up / Inscrever-se** (plano *Free Tier*).
2. **Home Region:** escolha **Brazil East (Sao Paulo)**. ⚠️ Não dá para trocar depois, e os recursos grátis só existem na região inicial.
3. Confirme e-mail, telefone e cartão. Espere a conta ficar ativa (alguns minutos).

## 2. Criar a máquina (instância)

1. No menu ☰ → **Compute → Instances → Create instance**.
2. **Name:** `vinlancord`.
3. **Image and shape → Edit:**
   - **Image:** *Canonical Ubuntu* **24.04** (não use a 22.04).
   - **Shape:** *Ampere* → **VM.Standard.A1.Flex** com **2 OCPUs e 12 GB de memória** (fica dentro do grátis).
   - Se aparecer *“Out of capacity”*, tente outro *Availability Domain* ou mais tarde. Plano B: *Specialty and previous generation* → **VM.Standard.E2.1.Micro** (mais fraca, mas funciona para poucas pessoas).
4. **Networking:** deixe criar a rede nova (VCN) e marque **Assign a public IPv4 address**.
5. **Add SSH keys:** pode escolher **Save private key** (guarde o arquivo; só serve para emergências).
6. Clique em **Show advanced options → Management → Paste cloud-init script** e cole **todo** o conteúdo abaixo:

```bash
#!/bin/bash
curl -fsSL --retry 5 https://raw.githubusercontent.com/drkptn/chaveiroDCR/refs/heads/claude/vinlancord-communication-app-vkiccq/vinlancord/infra/install.sh -o /root/vinlancord-install.sh
bash /root/vinlancord-install.sh > /var/log/vinlancord-install.log 2>&1
```

7. **Create.** Quando ficar *Running*, copie o **Public IP address** da página da instância.

## 3. Liberar as portas na rede da Oracle (uma regra só)

A Oracle bloqueia tudo por padrão na rede dela (além do firewall da máquina, que o instalador já configura).

1. Na página da instância, clique no link da **Subnet** → **Security Lists** → **Default Security List**.
2. **Add Ingress Rules:**
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** **All Protocols**
   - **Add Ingress Rules**.

Isso só abre a rede da Oracle; o firewall dentro da máquina continua deixando passar **apenas** as portas do Vinlancord (web, voz, vídeo e TURN) e o SSH.

## 4. Pronto

Em **10–20 minutos** o servidor estará em `https://SEU-IP-COM-TRACOS.sslip.io` (ex.: IP `150.230.10.20` → `https://150-230-10-20.sslip.io`).
Me mande o IP e eu gero o instalador do app já conectado a ele.

## Bom saber

- **Inatividade:** a Oracle pode desligar máquinas grátis que ficam ociosas por 7 dias seguidos (pouco uso de CPU, rede e memória). Para evitar, em **Billing → Upgrade and Manage Payment**, mude a conta para **Pay As You Go**: continua **grátis** enquanto você usar só recursos *Always Free*, e a regra de ociosidade deixa de valer.
- **Atualizações:** o servidor se atualiza sozinho todo dia às 05:00 (Brasília) quando houver versão nova; o app no PC também.
- **Backups:** cópia diária do banco em `/opt/vinlancord/vinlancord/infra/backups` (14 dias).
- **Se algo der errado:** o log da instalação fica em `/var/log/vinlancord-install.log`. Para reinstalar/atualizar à mão: `sudo bash /root/vinlancord-install.sh`.
- **Quem pode entrar:** qualquer pessoa com o app (ou o endereço) consegue criar conta. Para exigir um código de convite no cadastro, defina `REGISTRATION_CODE=…` em `/opt/vinlancord/vinlancord/.env` e rode o instalador de novo.

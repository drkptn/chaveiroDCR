#!/bin/bash
# Vinlancord na Oracle Cloud (Always Free): cole TODO este conteúdo em
# "Mostrar opções avançadas → Gerenciamento → Colar script cloud-init" ao criar a instância.
# No primeiro boot ele instala e liga o servidor sozinho (leva ~10–20 min). Log: /var/log/vinlancord-install.log
curl -fsSL --retry 5 https://raw.githubusercontent.com/drkptn/chaveiroDCR/refs/heads/claude/vinlancord-communication-app-vkiccq/vinlancord/infra/install.sh -o /root/vinlancord-install.sh
bash /root/vinlancord-install.sh > /var/log/vinlancord-install.log 2>&1

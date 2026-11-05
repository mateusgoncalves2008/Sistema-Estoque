(() => {
"use strict";
if (window.__hauyChatInicializado) return;
window.__hauyChatInicializado = true;
const API = "/api/chat";
const state = {config:{}, aba:"conversas", contatos:[], novosContatos:[], conversas:[], solicitacoes:[], bloqueios:[], online:new Set(), conversa:null, mensagens:[], carregando:false,responder:null};
let intervaloAtualizacaoChat=null, timeoutPararDigitando=null, ultimoAvisoDigitando=0;
const el = (tag, cls, text) => { const node=document.createElement(tag); if(cls) node.className=cls; if(text!==undefined) node.textContent=text; return node; };
async function api(path, options={}) {
 const response=await fetch(API+path,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
 let data={}; try{data=await response.json();}catch{}
 if(!response.ok) throw new Error(data.mensagem || "Não foi possível concluir a operação.");
 return data;
}
function criarInterface(){
 const panel=el("section","hauy-chat-painel"); panel.setAttribute("aria-label","Chat escolar"); const area=document.querySelector("main")||document.querySelector(".app")||document.body; area.classList.add("hauy-chat-area");
 const header=el("header","hauy-chat-topo"); const heading=el("div"); heading.append(el("h2","","Mensagens"),el("p","","Comunicação da comunidade escolar"));
 const controls=el("div","hauy-chat-controles"); const expand=el("button","hauy-chat-expandir","⛶"); expand.type="button"; expand.title="Expandir chat"; expand.setAttribute("aria-label","Expandir chat");
 const close=el("button","hauy-chat-fechar","×"); close.type="button"; close.title="Voltar ao tamanho normal"; close.setAttribute("aria-label","Voltar ao tamanho normal"); close.hidden=true;
 controls.append(expand,close); header.append(heading,controls);
 expand.addEventListener("click",()=>{panel.classList.add("expandido");expand.hidden=true;close.hidden=false;});
 close.addEventListener("click",()=>{panel.classList.remove("expandido");expand.hidden=false;close.hidden=true;});
 const body=el("div","hauy-chat-corpo"), side=el("aside","hauy-chat-lateral"), tabs=el("div","hauy-chat-abas"), search=el("input","hauy-chat-pesquisa"), list=el("div","hauy-chat-lista"), addContact=el("button","hauy-chat-adicionar","＋");
 addContact.type="button";addContact.title="Adicionar aos contatos";addContact.setAttribute("aria-label","Adicionar aos contatos");addContact.addEventListener("click",()=>{if(state.aba==="novos"){state.aba="contatos";render();}else abrirNovosContatos();});
 search.placeholder="Pesquisar"; search.type="search"; side.append(tabs,search,list);
 const conversation=el("section","hauy-chat-conversa"); body.append(side,conversation); panel.append(header,body); area.append(panel);
 const seletoresSino='button:has(.fa-bell),button:has(.fas.fa-bell),button:has([data-lucide="bell"]),button[aria-label*="aviso" i],button[title*="aviso" i],[role="button"]:has(.fa-bell),[role="button"]:has([data-lucide="bell"])';
 const atualizarSino=()=>{
  document.querySelectorAll(seletoresSino).forEach(botao=>{
   if(panel.classList.contains("aberto")){if(!botao.hasAttribute("data-hauy-sino-display"))botao.setAttribute("data-hauy-sino-display",botao.style.display||"");botao.style.setProperty("display","none","important");}
   else if(botao.hasAttribute("data-hauy-sino-display")){const display=botao.getAttribute("data-hauy-sino-display");botao.style.removeProperty("display");if(display)botao.style.display=display;botao.removeAttribute("data-hauy-sino-display");}
  });
 };
 const abrir=()=>{const nav=document.querySelector(".sidebar-nav, #nav, #menu, .sidebar nav");nav?.querySelectorAll("button,a,[role=button]").forEach(menu=>{if(menu.hasAttribute("data-hauy-chat-menu"))return;menu.classList.remove("active","ativo","on","selecionado");menu.removeAttribute("aria-current");});panel.classList.add("aberto");document.querySelector("[data-hauy-chat-menu]")?.classList.add("ativo");atualizarSino();abrirChat();atualizarPresenca();};
 const inserirMenu=()=>{
  const nav=document.querySelector(".sidebar-nav, #nav, #menu, .sidebar nav");
  if(!nav||nav.querySelector("[data-hauy-chat-menu]"))return;
  const item=el("button","hauy-chat-menu-item");
  item.type="button";item.dataset.hauyChatMenu="true";
  item.innerHTML='<span class="hauy-chat-menu-icone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 4.5h9.1a3.2 3.2 0 0 1 3.2 3.2v5.1a3.2 3.2 0 0 1-3.2 3.2h-1.1l-3.1 2.5v-2.5H8.2A3.2 3.2 0 0 1 5 12.8V7.7a3.2 3.2 0 0 1 3.2-3.2Z"/><path d="M5.1 8.1H4.7a2.7 2.7 0 0 0-2.7 2.7v5a2.7 2.7 0 0 0 2.7 2.7h1.1l2.7 2.1v-2.1h5.1"/></svg><span class="hauy-chat-menu-contador" hidden></span></span><span>Chat</span>';
  item.addEventListener("click",abrir);nav.append(item);
 };
 inserirMenu();
 const observer=new MutationObserver(inserirMenu);
 observer.observe(document.body,{childList:true,subtree:true});
 const observadorSino=new MutationObserver(atualizarSino);
 observadorSino.observe(document.body,{childList:true,subtree:true});
 atualizarSino();
 document.addEventListener("click",e=>{const menu=e.target.closest(".sidebar-nav button,.sidebar-nav a,.sidebar nav button,.sidebar nav a,#nav button,#nav a,#menu button,#menu a,.navegacao button,.navegacao a,[data-menu-item]");if(!menu)return;const nav=menu.closest(".sidebar-nav,.sidebar nav,#nav,#menu,.navegacao");if(menu.hasAttribute("data-hauy-chat-menu")){nav?.querySelectorAll("button,a,[role=button]").forEach(item=>{if(item===menu)return;item.classList.remove("active","ativo","on","selecionado");item.removeAttribute("aria-current");});return;}panel.classList.remove("aberto","expandido");document.querySelector("[data-hauy-chat-menu]")?.classList.remove("ativo");expand.hidden=false;close.hidden=true;},true);
 tabs.addEventListener("click",e=>{const b=e.target.closest("button[data-aba]");if(!b)return;state.aba=b.dataset.aba;state.conversa=null;state.mensagens=[];render();});
 search.addEventListener("input",()=>renderLista());
 list.addEventListener("click",e=>{const b=e.target.closest("button[data-id]");if(!b)return;if(state.aba==="novos")iniciarConversa(b.dataset.id);else if(state.aba==="contatos")selecionarConversaPorContato(b.dataset.id);else if(state.aba==="solicitacoes")responderSolicitacao(b.dataset.id,e.target.dataset.acao);else if(state.aba==="bloqueios")return;else selecionarConversa(b.dataset.id);});
 conversation.addEventListener("click",e=>{const a=e.target.closest("[data-chat-action]");if(a){e.stopPropagation();const id=a.dataset.messageId;const msg=state.mensagens.find(x=>String(x.id)===String(id));if(a.dataset.chatAction==="toggle-menu"){const menu=a.parentElement.querySelector(".hauy-chat-menu-mensagem");const abrir=!menu.classList.contains("aberto");document.querySelectorAll(".hauy-chat-menu-mensagem.aberto,.hauy-chat-seletor-reacoes.aberto").forEach(x=>x.classList.remove("aberto"));if(abrir)menu.classList.add("aberto");}else if(a.dataset.chatAction==="copy"&&msg){navigator.clipboard?.writeText(msg.body);a.closest(".hauy-chat-menu-mensagem")?.classList.remove("aberto");}else if(a.dataset.chatAction==="delete"&&msg){a.closest(".hauy-chat-menu-mensagem")?.classList.remove("aberto");abrirConfirmacaoExcluir(id);}else if(a.dataset.chatAction==="reply"&&msg){state.responder={id:msg.id,body:msg.body,sender:msg.sender_id};render();conversation.querySelector("textarea")?.focus();}else if(a.dataset.chatAction==="open-reactions"){let picker=a.parentElement.querySelector(".hauy-chat-seletor-reacoes");const abrir=!picker?.classList.contains("aberto");document.querySelectorAll(".hauy-chat-menu-mensagem.aberto,.hauy-chat-seletor-reacoes.aberto").forEach(x=>x.classList.remove("aberto"));if(!picker){picker=el("div","hauy-chat-seletor-reacoes");["👍","❤️","😂","😮","😢","🙏"].forEach(emoji=>{const bt=el("button","",emoji);bt.type="button";bt.dataset.chatAction="choose-reaction";bt.dataset.messageId=id;bt.dataset.emoji=emoji;picker.append(bt);});const plus=el("button","hauy-chat-mais-emojis","+");plus.type="button";plus.dataset.chatAction="more-reactions";plus.dataset.messageId=id;picker.append(plus);a.parentElement.append(picker);}if(abrir){picker.classList.add("aberto");posicionarSeletorReacoes(a,picker);}}else if(a.dataset.chatAction==="choose-reaction"){salvarReacao(id,a.dataset.emoji);}else if(a.dataset.chatAction==="more-reactions"){abrirMaisEmojis(id);}}const b=e.target.closest("[data-acao]");if(!b)return;if(b.dataset.acao==="enviar")enviarMensagem();if(b.dataset.acao==="silenciar")silenciar();if(b.dataset.acao==="bloquear")bloquear();});
 document.addEventListener("click",e=>{if(e.target.closest(".hauy-chat-acoes-mensagem"))return;document.querySelectorAll(".hauy-chat-menu-mensagem.aberto,.hauy-chat-seletor-reacoes.aberto").forEach(x=>x.classList.remove("aberto"));});
 conversation.addEventListener("input",e=>{if(e.target.matches("textarea")){ajustarAlturaCampo(e.target);if(e.target.value.length>=500)mostrarAvisoMensagemLonga(e.target);if(state.conversa?.status==="ACTIVE")avisarDigitando(true);}});
 conversation.addEventListener("keydown",e=>{if(e.target.matches("textarea")&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviarMensagem();}});
 panel._parts={tabs,search,list,conversation,addContact};
}
function atualizarContadorMenu(){
 const total=state.conversas.reduce((s,c)=>s+Math.max(0,Number(c.naoLidas)||0),0);
 document.querySelectorAll("[data-hauy-chat-menu]").forEach(item=>{
  const contador=item.querySelector(".hauy-chat-menu-contador");if(!contador)return;
  contador.textContent=total>99?"99+":String(total);contador.hidden=total===0;
  item.setAttribute("aria-label",total?`Chat, ${total} mensagens não lidas`:"Chat");
 });
}
function formatarData(v){if(!v)return "";const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
async function abrirChat(){
 try{state.carregando=true;render();const [cfg,cs,cv]=await Promise.all([api("/configuracao"),api("/conversas"),api("/contatos")]);state.config=cfg;window.__hauyChatUsuarioID=cfg.usuarioID;state.conversas=cs.conversas||[];state.contatos=cv.contatos||[];atualizarContadorMenu();state.aba="conversas";render();}
 catch(e){mostrarErro(e.message);}
}
function mostrarErro(msg){const c=document.querySelector(".hauy-chat-conversa");if(c){c.replaceChildren(el("p","hauy-chat-vazio",msg));}}
function render(){
 const panel=document.querySelector(".hauy-chat-painel");if(!panel)return;const p=panel._parts;
 p.tabs.replaceChildren();const abas=[["conversas","Conversas"],["contatos","Contatos"]];if(state.config.podeAlterar)abas.push(["solicitacoes","Solicitações"],["bloqueios","Bloqueios"],["config","Config."]);
 abas.forEach(([id,nome])=>{const b=el("button",state.aba===id||(id==="contatos"&&state.aba==="novos")?"ativo":"",nome);b.type="button";b.dataset.aba=id;p.tabs.append(b);if(id==="contatos"){p.addContact.textContent=state.aba==="novos"?"←":"＋";p.addContact.title=state.aba==="novos"?"Voltar para contatos":"Adicionar aos contatos";p.tabs.append(p.addContact);}});
 p.search.hidden=state.aba==="solicitacoes"||state.aba==="bloqueios"||state.aba==="config";p.search.value="";
 renderLista();renderConversa();
}
function renderLista(){
 const p=document.querySelector(".hauy-chat-painel")?document.querySelector(".hauy-chat-painel")._parts:null;if(!p)return;p.list.replaceChildren();
 let dados=state.aba==="contatos"?state.contatos:state.aba==="novos"?state.novosContatos:state.aba==="solicitacoes"?state.solicitacoes:state.aba==="bloqueios"?state.bloqueios:state.conversas.filter(x=>x.estabelecida);
 const q=p.search.value.trim().toLocaleLowerCase("pt-BR");if(q)dados=dados.filter(x=>(x.nome||x.solicitante?.nome||x.contato?.nome||"").toLocaleLowerCase("pt-BR").includes(q));
 if(!dados.length){p.list.append(el("p","hauy-chat-vazio",state.aba==="conversas"?"Nenhuma conversa por enquanto.":state.aba==="contatos"?"Nenhum contato aguardando resposta.":state.aba==="novos"?"Nenhum usuário disponível para adicionar.":state.aba==="solicitacoes"?"Nenhuma solicitação pendente.":"Nenhum usuário bloqueado."));return;}
 dados.forEach(item=>{
  const id=state.aba==="solicitacoes"?item.id:state.aba==="bloqueios"?item.usuarioID:state.aba==="conversas"?item.contato?.id:item.id;
  const nome=state.aba==="solicitacoes"?item.solicitante?.nome:state.aba==="bloqueios"?item.nome:state.aba==="conversas"?item.contato?.nome:item.nome;
  const conversa=state.aba==="conversas"?item:state.conversas.find(x=>String(x.contato?.id)===String(id));
  const naoLidas=Number(conversa?.naoLidas||0);
  const sub=state.aba==="solicitacoes"?"Solicitação de conversa":state.aba==="bloqueios"?"Bloqueado pelo ADM":naoLidas>0?(`${naoLidas} nova${naoLidas===1?"":"s"} mensagem${naoLidas===1?"":"s"}`):state.aba==="conversas"?(item.ultimaMensagem||"Conversa"):"";
  const idSelecionado=state.aba==="conversas"?item.id:id;const b=el("button","hauy-chat-item"+(state.conversa?.id===idSelecionado?" selecionado":""));b.type="button";b.dataset.id=idSelecionado;
  const avatar=el("span","hauy-chat-avatar-wrap");avatar.append(el("span","hauy-chat-avatar",(nome||"U").trim().charAt(0).toUpperCase()));
  if(state.online.has(String(id)))avatar.append(el("span","hauy-chat-online"));
  const t=el("span","hauy-chat-item-texto");t.append(el("strong","",nome||"Usuário"));
  if(sub){const detalhe=el("small",naoLidas>0?"hauy-chat-nao-lidas":"",sub);t.append(detalhe);}
  b.append(avatar,t);
  if(state.aba==="solicitacoes"){const actions=el("span");["ACEITAR","RECUSAR"].forEach(a=>{const x=el("button","hauy-chat-acao",a==="ACEITAR"?"Aceitar":"Recusar");x.type="button";x.dataset.acao=a;x.dataset.id=item.id;actions.append(x);});b.append(actions);}
  p.list.append(b);
 });
}
function mostrarAvisoMensagemLonga(campo){const form=campo.closest(".hauy-chat-compositor");if(!form)return;let aviso=form.querySelector(".hauy-chat-aviso-limite");if(!aviso){aviso=el("div","hauy-chat-aviso-limite","Sua mensagem é muito longa");form.append(aviso);}aviso.classList.add("visivel");if(aviso._timer)clearTimeout(aviso._timer);aviso._timer=setTimeout(()=>aviso.classList.remove("visivel"),3000);}
function ajustarAlturaCampo(campo){campo.style.height="auto";campo.style.height=campo.scrollHeight+"px";campo.style.overflowY="hidden";}
function renderConversa(){
 const c=document.querySelector(".hauy-chat-painel")._parts.conversation;c.replaceChildren();
 if(state.aba==="novos"){c.append(el("p","hauy-chat-vazio","Escolha uma pessoa na lista para adicionar aos seus contatos."));return;}
 if(state.aba==="solicitacoes"){c.append(el("p","hauy-chat-vazio","Analise as solicitações recebidas. Você pode aceitar ou recusar cada pedido."));return;}
 if(state.aba==="bloqueios"){c.append(el("p","hauy-chat-vazio","Os bloqueios são permanentes e impedem o contato com o ADM."));return;}
 if(state.aba==="config"){const wrap=el("div","hauy-chat-alerta",state.config.modoRestritoADM?"Modo restrito do ADM está ativado. Novos contatos precisam enviar uma solicitação.":"Modo restrito do ADM está desativado. Os usuários podem iniciar conversas normalmente.");const btn=el("button","hauy-chat-btn",state.config.modoRestritoADM?"Desativar modo restrito":"Ativar modo restrito");btn.type="button";btn.style.minHeight="42px";btn.addEventListener("click",alternarModoRestrito);c.append(wrap,btn);return;}
 if(!state.conversa){c.append(el("p","hauy-chat-vazio","Selecione uma conversa ou escolha um contato para começar."));return;}
 const top=el("div","hauy-chat-conversa-topo"),ident=el("div");ident.append(el("strong","",state.conversa.contato?.nome||"Conversa"),el("small","",state.conversa.status==="PENDING"?"Aguardando resposta do ADM":state.conversa.status==="REJECTED"?"Solicitação recusada":"Conversa ativa"));
 top.append(ident);
 if(state.conversa.status==="ACTIVE"){const mute=el("button","hauy-chat-acao",state.conversa.silenciado?"Ativar notificações":"Silenciar");mute.type="button";mute.dataset.acao="silenciar";top.append(mute);}
 if(state.config.podeAlterar){const block=el("button","hauy-chat-acao","Bloquear");block.type="button";block.dataset.acao="bloquear";top.append(block);}
 c.append(top);
 const messages=el("div","hauy-chat-mensagens");const usuarioAtualID=String(state.config.usuarioID??window.__hauyChatUsuarioID??"").trim();const nomeAtual=state.config.usuarioNome||"Você";const nomeContato=state.conversa.contato?.nome||"Outro usuário";state.mensagens.forEach(m=>{const propria=String(m.sender_id??"").trim()===usuarioAtualID;const nomeRemetente=propria?nomeAtual:nomeContato;const linha=el("div","hauy-chat-mensagem-linha"+(propria?" propria":""));linha.dataset.remetente=propria?"voce":"outro";const avatar=el("span","hauy-chat-mensagem-avatar",(nomeRemetente||"U").trim().charAt(0).toUpperCase());avatar.setAttribute("aria-hidden","true");const grupo=el("div","hauy-chat-mensagem-conteudo");if(m.reply_body){const cit=el("div","hauy-chat-resposta-citacao");cit.append(el("strong","",m.reply_sender_id===usuarioAtualID?"Você":nomeContato),el("span","",m.reply_body));grupo.append(cit);}const textoMensagem=String(m.body??"");const balao=el("div","hauy-chat-balao"+(propria?" proprio":"")+(textoMensagem.length<=60?" mensagem-curta":""));const mensagemFormatada=textoMensagem.split(/(\r\n|\n|\r)/).map(parte=>{if(/^(\r\n|\n|\r)$/.test(parte)||parte.length<=60)return parte;const palavras=parte.trim().split(/\s+/);if(palavras.some(p=>p.length>60)){const linhas=[];let linha="";for(const palavra of palavras){if(palavra.length>60){if(linha)linhas.push(linha);const chars=Array.from(palavra);while(chars.length>60)linhas.push(chars.splice(0,60).join(""));linha=chars.join("");}else if(!linha)linha=palavra;else if(linha.length+1+palavra.length<=60)linha+=" "+palavra;else{linhas.push(linha);linha=palavra;}}if(linha)linhas.push(linha);return linhas.join("\n");}const total=palavras.reduce((s,p)=>s+p.length,0)+palavras.length-1;const quantidadeLinhas=Math.ceil(total/60);const alvo=total/quantidadeLinhas;const linhas=[];let indice=0;for(let l=0;l<quantidadeLinhas;l++){let linha="";const linhasRestantes=quantidadeLinhas-l-1;while(indice<palavras.length){const palavra=palavras[indice];const candidato=linha?linha+" "+palavra:palavra;const palavrasRestantes=palavras.length-indice-1;if(candidato.length>60|| (linha&&Math.abs(candidato.length-alvo)>Math.abs(linha.length-alvo)&&palavrasRestantes>=linhasRestantes))break;linha=candidato;indice++;if(linha.length>=alvo&&palavrasRestantes>=linhasRestantes)break;}if(linha)linhas.push(linha);}return linhas.join("\n");}).join("");balao.append(document.createTextNode(mensagemFormatada));const reacoes=el("div","hauy-chat-reacoes");(m.reactions||[]).forEach(r=>{const chip=el("span","hauy-chat-reacao",r.emoji+" "+r.total);reacoes.append(chip);});if(reacoes.childElementCount)balao.append(reacoes);const acoes=el("div","hauy-chat-acoes-mensagem");const responder=el("button","hauy-chat-icone-acao","↩");responder.type="button";responder.title="Responder";responder.dataset.chatAction="reply";responder.dataset.messageId=m.id;const reagir=el("button","hauy-chat-icone-acao hauy-chat-botao-reagir");reagir.type="button";reagir.title="Reagir";reagir.dataset.chatAction="open-reactions";reagir.dataset.messageId=m.id;reagir.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="9" cy="9.5" r="1" class="olho"></circle><circle cx="15" cy="9.5" r="1" class="olho"></circle><path d="M8 14c1 2 2.3 3 4 3s3-1 4-3"></path></svg><span class="hauy-chat-tooltip-reagir">Reagir</span>';const pontos=el("button","hauy-chat-icone-acao","⋮");pontos.type="button";pontos.title="Mais opções";pontos.dataset.chatAction="toggle-menu";pontos.dataset.messageId=m.id;const menu=el("div","hauy-chat-menu-mensagem");const copiar=el("button","hauy-chat-item-menu","Copiar");copiar.type="button";copiar.dataset.chatAction="copy";copiar.dataset.messageId=m.id;menu.append(copiar);if(propria){const excluir=el("button","hauy-chat-item-menu hauy-chat-item-menu-excluir","Excluir");excluir.type="button";excluir.dataset.chatAction="delete";excluir.dataset.messageId=m.id;menu.append(excluir);}acoes.append(responder,reagir,pontos,menu);const linhaBalao=el("div","hauy-chat-balao-linha");if(propria)linhaBalao.append(acoes,balao);else linhaBalao.append(balao,acoes);grupo.append(linhaBalao);linha.append(avatar,grupo);messages.append(linha);});if(!state.mensagens.length)messages.append(el("p","hauy-chat-vazio","Envie a primeira mensagem desta conversa."));
 c.append(messages);
 const digitando=el("div","hauy-chat-digitando");digitando.hidden=true;digitando.append(el("span","hauy-chat-pontos","•••"),el("span","hauy-chat-digitando-texto","Está digitando"));c.append(digitando);
 if(state.conversa.status==="ACTIVE"){const form=el("form","hauy-chat-compositor");if(state.responder){const preview=el("div","hauy-chat-responder-preview");preview.append(el("strong","",state.responder.sender===usuarioAtualID?"Respondendo a você":"Respondendo a "+nomeContato),el("span","",state.responder.body));const cancelar=el("button","hauy-chat-cancelar-resposta","×");cancelar.type="button";cancelar.addEventListener("click",()=>{state.responder=null;render();});preview.append(cancelar);c.append(preview);}const area=el("textarea");area.maxLength=500;area.rows=1;area.placeholder="Escreva uma mensagem...";const send=el("button","hauy-chat-btn","Enviar");send.type="button";send.dataset.acao="enviar";form.append(area,send);c.append(form);messages.scrollTop=messages.scrollHeight;}
 else c.append(el("div","hauy-chat-alerta",state.conversa.status==="PENDING"?"Sua solicitação foi enviada. Aguarde o ADM aceitar.":"Esta solicitação foi recusada. Você pode iniciar uma nova solicitação pelo contato do ADM."));
}
function abrirConfirmacaoExcluir(id){
 const overlay=el("div","hauy-chat-modal-excluir");
 const caixa=el("section","hauy-chat-modal-excluir-caixa");
 caixa.setAttribute("role","dialog");caixa.setAttribute("aria-modal","true");caixa.setAttribute("aria-labelledby","hauy-chat-modal-excluir-titulo");
 const titulo=el("h2","","Cancelar o envio da mensagem?");titulo.id="hauy-chat-modal-excluir-titulo";
 const descricao=el("p","","A mensagem será removida para todos, mas talvez as pessoas já a tenham visto. Se a conversa for denunciada, mensagens com envio cancelado poderão ser incluídas.");
 const botoes=el("div","hauy-chat-modal-excluir-botoes");
 const confirmar=el("button","hauy-chat-modal-excluir-confirmar","Cancelar Envio");confirmar.type="button";
 const cancelar=el("button","hauy-chat-modal-excluir-cancelar","Cancelar");cancelar.type="button";
 const fechar=()=>overlay.remove();
 cancelar.addEventListener("click",fechar);
 overlay.addEventListener("click",e=>{if(e.target===overlay)fechar();});
 confirmar.addEventListener("click",async()=>{
  confirmar.disabled=true;cancelar.disabled=true;
  try{
   await api("/mensagens/"+encodeURIComponent(id),{method:"DELETE"});
   state.mensagens=state.mensagens.filter(m=>String(m.id)!==String(id));
   if(state.responder&&String(state.responder.id)===String(id))state.responder=null;
   fechar();render();
  }catch(e){confirmar.disabled=false;cancelar.disabled=false;mostrarErro(e.message);}
 });
 botoes.append(confirmar,cancelar);caixa.append(titulo,descricao,botoes);overlay.append(caixa);document.body.append(overlay);cancelar.focus();
}
async function salvarReacao(id,emoji){try{await api("/mensagens/"+encodeURIComponent(id)+"/reacoes",{method:"POST",body:JSON.stringify({emoji})});const r=await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/mensagens");state.mensagens=r.mensagens||[];render();}catch(e){mostrarErro(e.message);}}
function abrirMaisEmojis(id){const emojis=["😄","😁","🥰","😍","🤣","🙂","😉","🤔","😎","😭","😡","👏","🎉","🔥","💯","🙏","💔","✨","🙌","🤝","👀","💪","🥳","🤗"];const botao=document.querySelector('.hauy-chat-botao-reagir[data-message-id="'+id+'"]');if(!botao)return;let picker=botao.parentElement.querySelector(".hauy-chat-seletor-reacoes");if(!picker){picker=el("div","hauy-chat-seletor-reacoes");botao.parentElement.append(picker);}picker.replaceChildren();emojis.forEach(emoji=>{const bt=el("button","",emoji);bt.type="button";bt.dataset.chatAction="choose-reaction";bt.dataset.messageId=id;bt.dataset.emoji=emoji;picker.append(bt);});picker.classList.add("aberto");posicionarSeletorReacoes(botao,picker);}
function posicionarSeletorReacoes(botao,picker){
 const pai=picker.parentElement;
 const area=botao.closest(".hauy-chat-conversa")||document.querySelector(".hauy-chat-conversa");
 if(!pai||!area||!botao)return;
 const botaoRect=botao.getBoundingClientRect();
 const paiRect=pai.getBoundingClientRect();
 const areaRect=area.getBoundingClientRect();
 const largura=picker.offsetWidth;
 const altura=picker.offsetHeight;
 const margem=8;
 let esquerda=botaoRect.left-paiRect.left+(botaoRect.width-largura)/2;
 const minimo=areaRect.left-paiRect.left+margem;
 const maximo=areaRect.right-paiRect.left-largura-margem;
 esquerda=Math.max(minimo,Math.min(esquerda,maximo));
 let topo;
 const espacoAbaixo=areaRect.bottom-botaoRect.bottom;
 const espacoAcima=botaoRect.top-areaRect.top;
 if(espacoAbaixo>=altura+margem){
  topo=botaoRect.bottom-paiRect.top+margem;
 }else if(espacoAcima>=altura+margem){
  topo=botaoRect.top-paiRect.top-altura-margem;
 }else if(espacoAbaixo>=espacoAcima){
  topo=botaoRect.bottom-paiRect.top+margem;
 }else{
  topo=botaoRect.top-paiRect.top-altura-margem;
 }
 const topoMinimo=areaRect.top-paiRect.top+margem;
 const topoMaximo=areaRect.bottom-paiRect.top-altura-margem;
 topo=Math.max(topoMinimo,Math.min(topo,topoMaximo));
 picker.style.left=esquerda+"px";
 picker.style.right="auto";
 picker.style.top=topo+"px";
 picker.style.bottom="auto";
}
async function selecionarConversaPorContato(id){const item=state.conversas.find(x=>x.contato?.id===id);if(item)await selecionarConversa(item.id);}
async function abrirNovosContatos(){try{const r=await api("/novos-contatos");state.novosContatos=r.contatos||[];state.aba="novos";state.conversa=null;state.mensagens=[];render();}catch(e){mostrarErro(e.message);}}
async function selecionarConversa(id){try{const item=state.conversas.find(x=>x.id===id);if(!item)return;state.conversa=item;const r=await api("/conversas/"+encodeURIComponent(id)+"/mensagens");state.mensagens=r.mensagens||[];render();}catch(e){mostrarErro(e.message);}}
async function iniciarConversa(id){const contato=state.novosContatos.find(x=>x.id===id);if(!contato)return;const mensagem=window.prompt("Escreva a primeira mensagem para "+contato.nome+":");if(!mensagem||!mensagem.trim())return;try{const r=await api("/conversas",{method:"POST",body:JSON.stringify({destinatarioID:id,mensagem:mensagem.trim()})});await abrirChat();const item=state.conversas.find(x=>x.id===r.conversaID);if(item)selecionarConversa(item.id);else mostrarErro(r.mensagem);}catch(e){mostrarErro(e.message);}}
async function enviarMensagem(){const c=document.querySelector(".hauy-chat-painel")._parts.conversation;const area=c.querySelector("textarea");const mensagem=area?.value.trim();if(!mensagem||!state.conversa)return;const btn=c.querySelector('[data-acao="enviar"]');btn.disabled=true;try{await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/mensagens",{method:"POST",body:JSON.stringify({mensagem,responderA:state.responder?.id||null})});state.responder=null;const r=await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/mensagens");state.mensagens=r.mensagens||[];await atualizarConversas();render();}catch(e){mostrarErro(e.message);}finally{btn.disabled=false;}}
async function avisarDigitando(ativo){
 if(!state.conversa?.id)return;
 if(timeoutPararDigitando)clearTimeout(timeoutPararDigitando);
 const agora=Date.now();
 if(ativo && agora-ultimoAvisoDigitando<1200){timeoutPararDigitando=setTimeout(()=>avisarDigitando(false),2500);return;}
 ultimoAvisoDigitando=agora;
 try{await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/digitando",{method:"POST",body:JSON.stringify({ativo})});}catch{}
 if(ativo)timeoutPararDigitando=setTimeout(()=>avisarDigitando(false),2500);
}
async function atualizarChatEmSegundoPlano(){
 if(!document.querySelector(".hauy-chat-painel.aberto")||!state.conversa?.id||state.conversa.status!=="ACTIVE"||document.hidden)return;
 const id=state.conversa.id;
 try{
  const mr=await api("/conversas/"+encodeURIComponent(id)+"/mensagens");
  if(state.conversa?.id!==id)return;
  const novas=mr.mensagens||[];
  const mudou=novas.length!==state.mensagens.length||novas.some((m,i)=>String(m.id)!==String(state.mensagens[i]?.id));
  if(mudou){
   const painel=document.querySelector(".hauy-chat-painel"),area=painel?._parts.conversation;
   const caixa=area?.querySelector(".hauy-chat-mensagens"),pertoDoFim=!caixa||caixa.scrollHeight-caixa.scrollTop-caixa.clientHeight<100;
   const rascunho=area?.querySelector("textarea")?.value||"";
   state.mensagens=novas;render();
   const novaArea=document.querySelector(".hauy-chat-painel")?._parts.conversation;
   const novaCaixa=novaArea?.querySelector(".hauy-chat-mensagens");
   if(pertoDoFim&&novaCaixa)novaCaixa.scrollTop=novaCaixa.scrollHeight;
   const textarea=novaArea?.querySelector("textarea");if(textarea&&rascunho){textarea.value=rascunho;ajustarAlturaCampo(textarea);textarea.focus();}
  }
 }catch{}
}
async function consultarDigitando(){if(!document.querySelector(".hauy-chat-painel.aberto")||!state.conversa?.id||state.conversa.status!=="ACTIVE"||document.hidden)return;const id=state.conversa.id;try{const tr=await api("/conversas/"+encodeURIComponent(id)+"/digitando");if(state.conversa?.id!==id)return;const indicador=document.querySelector(".hauy-chat-painel")?._parts.conversation.querySelector(".hauy-chat-digitando");if(indicador){indicador.hidden=!tr.digitando;const texto=indicador.querySelector(".hauy-chat-digitando-texto");if(texto)texto.textContent=(tr.nome||"Alguém")+" está digitando";}}catch{}}
async function atualizarPresenca(){try{const p=await api("/presenca");state.online=new Set((p.online||[]).map(String));if(document.querySelector(".hauy-chat-painel.aberto"))renderLista();}catch{}}
async function atualizarConversas(){const r=await api("/conversas");state.conversas=r.conversas||[];atualizarContadorMenu();if(state.conversa)state.conversa=state.conversas.find(x=>x.id===state.conversa.id)||state.conversa;if(document.querySelector(".hauy-chat-painel.aberto"))renderLista();}
async function silenciar(){try{const valor=!state.conversa.silenciado;await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/silenciar",{method:"PATCH",body:JSON.stringify({silenciado:valor})});state.conversa.silenciado=valor;render();}catch(e){mostrarErro(e.message);}}
async function bloquear(){if(!state.config.podeAlterar||!state.conversa)return;const id=state.conversa.contato?.id;if(!id||!confirm("Bloquear este usuário no chat? Ele não poderá mais encontrar o ADM nem acessar conversas com o administrador."))return;try{await api("/bloqueios",{method:"POST",body:JSON.stringify({usuarioID:id})});state.conversa=null;await abrirChat();}catch(e){mostrarErro(e.message);}}
async function responderSolicitacao(id,acao){if(!acao)return;try{await api("/solicitacoes/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({acao})});await carregarSolicitacoes();await atualizarConversas();render();}catch(e){mostrarErro(e.message);}}
async function alternarModoRestrito(){try{const ativo=!state.config.modoRestritoADM;const r=await api("/configuracao/modo-restrito",{method:"PATCH",body:JSON.stringify({ativo})});state.config.modoRestritoADM=r.modoRestritoADM;render();}catch(e){mostrarErro(e.message);}}
async function carregarSolicitacoes(){const [s,b]=await Promise.all([api("/solicitacoes"),api("/bloqueios")]);state.solicitacoes=s.solicitacoes||[];state.bloqueios=b.bloqueios||[];}
document.addEventListener("DOMContentLoaded",async()=>{try{const r=await api("/configuracao");state.config=r;window.__hauyChatUsuarioID=r.usuarioID;criarInterface();if(r.podeAlterar){try{await carregarSolicitacoes();}catch{}}if(intervaloAtualizacaoChat)clearInterval(intervaloAtualizacaoChat);intervaloAtualizacaoChat=setInterval(atualizarChatEmSegundoPlano,2000);setInterval(consultarDigitando,1000);await api("/presenca",{method:"POST",body:"{}"});await atualizarPresenca();setInterval(async()=>{await atualizarPresenca();await atualizarConversas();},3000);}catch(e){console.info("Chat indisponível nesta sessão:",e.message);}});
})();
(() => {
"use strict";
if (window.__hauyChatInicializado) return;
window.__hauyChatInicializado = true;
const API = "/api/chat";
const state = {config:{}, aba:"conversas", contatos:[], novosContatos:[], conversas:[], solicitacoes:[], bloqueios:[], online:new Set(), conversa:null, mensagens:[], carregando:false};
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
 const abrir=()=>{panel.classList.add("aberto");atualizarSino();abrirChat();atualizarPresenca();};
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
 document.addEventListener("click",e=>{const menu=e.target.closest("nav button, nav a, .sidebar button[data-page], .sidebar button[data-p], .sidebar button[data-tela]");if(menu&&!menu.hasAttribute("data-hauy-chat-menu")){panel.classList.remove("aberto","expandido");expand.hidden=false;close.hidden=true;}},true);
 tabs.addEventListener("click",e=>{const b=e.target.closest("button[data-aba]");if(!b)return;state.aba=b.dataset.aba;state.conversa=null;state.mensagens=[];render();});
 search.addEventListener("input",()=>renderLista());
 list.addEventListener("click",e=>{const b=e.target.closest("button[data-id]");if(!b)return;if(state.aba==="novos")iniciarConversa(b.dataset.id);else if(state.aba==="contatos")selecionarConversaPorContato(b.dataset.id);else if(state.aba==="solicitacoes")responderSolicitacao(b.dataset.id,e.target.dataset.acao);else if(state.aba==="bloqueios")return;else selecionarConversa(b.dataset.id);});
 conversation.addEventListener("click",e=>{const b=e.target.closest("[data-acao]");if(!b)return;if(b.dataset.acao==="enviar")enviarMensagem();if(b.dataset.acao==="silenciar")silenciar();if(b.dataset.acao==="bloquear")bloquear();});
 conversation.addEventListener("input",e=>{if(e.target.matches("textarea")&&state.conversa?.status==="ACTIVE")avisarDigitando(true);});
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
 const messages=el("div","hauy-chat-mensagens");const usuarioAtualID=String(state.config.usuarioID??window.__hauyChatUsuarioID??"").trim();const nomeAtual=state.config.usuarioNome||"Você";const nomeContato=state.conversa.contato?.nome||"Outro usuário";state.mensagens.forEach(m=>{const remetenteID=String(m.sender_id??"").trim();const propria=Boolean(usuarioAtualID)&&remetenteID===usuarioAtualID;const b=el("div","hauy-chat-balao"+(propria?" proprio":""));b.dataset.remetente=propria?"voce":"outro";b.append(el("strong","hauy-chat-remetente",propria?nomeAtual:nomeContato));b.append(document.createTextNode(m.body));b.append(el("time","",formatarData(m.created_at)));messages.append(b);});if(!state.mensagens.length)messages.append(el("p","hauy-chat-vazio","Envie a primeira mensagem desta conversa."));
 c.append(messages);
 const digitando=el("div","hauy-chat-digitando");digitando.hidden=true;digitando.append(el("span","hauy-chat-pontos","•••"),el("span","hauy-chat-digitando-texto","Está digitando"));c.append(digitando);
 if(state.conversa.status==="ACTIVE"){const form=el("form","hauy-chat-compositor"),area=el("textarea");area.maxLength=2000;area.rows=1;area.placeholder="Escreva uma mensagem...";const send=el("button","hauy-chat-btn","Enviar");send.type="button";send.dataset.acao="enviar";form.append(area,send);c.append(form);messages.scrollTop=messages.scrollHeight;}
 else c.append(el("div","hauy-chat-alerta",state.conversa.status==="PENDING"?"Sua solicitação foi enviada. Aguarde o ADM aceitar.":"Esta solicitação foi recusada. Você pode iniciar uma nova solicitação pelo contato do ADM."));
}
async function selecionarConversaPorContato(id){const item=state.conversas.find(x=>x.contato?.id===id);if(item)await selecionarConversa(item.id);}
async function abrirNovosContatos(){try{const r=await api("/novos-contatos");state.novosContatos=r.contatos||[];state.aba="novos";state.conversa=null;state.mensagens=[];render();}catch(e){mostrarErro(e.message);}}
async function selecionarConversa(id){try{const item=state.conversas.find(x=>x.id===id);if(!item)return;state.conversa=item;const r=await api("/conversas/"+encodeURIComponent(id)+"/mensagens");state.mensagens=r.mensagens||[];render();}catch(e){mostrarErro(e.message);}}
async function iniciarConversa(id){const contato=state.novosContatos.find(x=>x.id===id);if(!contato)return;const mensagem=window.prompt("Escreva a primeira mensagem para "+contato.nome+":");if(!mensagem||!mensagem.trim())return;try{const r=await api("/conversas",{method:"POST",body:JSON.stringify({destinatarioID:id,mensagem:mensagem.trim()})});await abrirChat();const item=state.conversas.find(x=>x.id===r.conversaID);if(item)selecionarConversa(item.id);else mostrarErro(r.mensagem);}catch(e){mostrarErro(e.message);}}
async function enviarMensagem(){const c=document.querySelector(".hauy-chat-painel")._parts.conversation;const area=c.querySelector("textarea");const mensagem=area?.value.trim();if(!mensagem||!state.conversa)return;const btn=c.querySelector('[data-acao="enviar"]');btn.disabled=true;try{await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/mensagens",{method:"POST",body:JSON.stringify({mensagem})});const r=await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/mensagens");state.mensagens=r.mensagens||[];await atualizarConversas();render();}catch(e){mostrarErro(e.message);}finally{btn.disabled=false;}}
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
   const textarea=novaArea?.querySelector("textarea");if(textarea&&rascunho){textarea.value=rascunho;textarea.focus();}
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
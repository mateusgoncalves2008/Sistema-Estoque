(() => {
"use strict";
if (window.__hauyChatInicializado) return;
window.__hauyChatInicializado = true;
const API = "/api/chat";
const state = {config:{}, aba:"conversas", contatos:[], conversas:[], solicitacoes:[], bloqueios:[], conversa:null, mensagens:[], carregando:false};
const el = (tag, cls, text) => { const node=document.createElement(tag); if(cls) node.className=cls; if(text!==undefined) node.textContent=text; return node; };
async function api(path, options={}) {
 const response=await fetch(API+path,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
 let data={}; try{data=await response.json();}catch{}
 if(!response.ok) throw new Error(data.mensagem || "Não foi possível concluir a operação.");
 return data;
}
function criarInterface(){
 const panel=el("section","hauy-chat-painel"); panel.setAttribute("aria-label","Chat escolar"); const area=document.querySelector("main")||document.querySelector(".app")||document.body; area.classList.add("hauy-chat-area");
 const header=el("header","hauy-chat-topo"); const heading=el("div"); heading.append(el("h2","","Mensagens"),el("p","","Comunicação da comunidade escolar")); header.append(heading);
 const body=el("div","hauy-chat-corpo"), side=el("aside","hauy-chat-lateral"), tabs=el("div","hauy-chat-abas"), search=el("input","hauy-chat-pesquisa"), list=el("div","hauy-chat-lista");
 search.placeholder="Pesquisar"; search.type="search"; side.append(tabs,search,list);
 const conversation=el("section","hauy-chat-conversa"); body.append(side,conversation); panel.append(header,body); area.append(panel);
 const abrir=()=>{panel.classList.add("aberto");abrirChat();};
 const inserirMenu=()=>{
  const nav=document.querySelector(".sidebar-nav, #nav, #menu, .sidebar nav");
  if(!nav||nav.querySelector("[data-hauy-chat-menu]"))return;
  const item=el("button","hauy-chat-menu-item");
  item.type="button";item.dataset.hauyChatMenu="true";
  item.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg><span>Chat</span>';
  item.addEventListener("click",abrir);nav.append(item);
 };
 inserirMenu();
 const observer=new MutationObserver(inserirMenu);
 observer.observe(document.body,{childList:true,subtree:true});
 document.addEventListener("click",e=>{const menu=e.target.closest("nav button, nav a, .sidebar button[data-page], .sidebar button[data-p], .sidebar button[data-tela]");if(menu&&!menu.hasAttribute("data-hauy-chat-menu"))panel.classList.remove("aberto");},true);
 tabs.addEventListener("click",e=>{const b=e.target.closest("button[data-aba]");if(!b)return;state.aba=b.dataset.aba;state.conversa=null;state.mensagens=[];render();});
 search.addEventListener("input",()=>renderLista());
 list.addEventListener("click",e=>{const b=e.target.closest("button[data-id]");if(!b)return;if(state.aba==="contatos")iniciarConversa(b.dataset.id);else if(state.aba==="solicitacoes")responderSolicitacao(b.dataset.id,e.target.dataset.acao);else if(state.aba==="bloqueios")return;else selecionarConversa(b.dataset.id);});
 conversation.addEventListener("click",e=>{const b=e.target.closest("[data-acao]");if(!b)return;if(b.dataset.acao==="enviar")enviarMensagem();if(b.dataset.acao==="silenciar")silenciar();if(b.dataset.acao==="bloquear")bloquear();});
 conversation.addEventListener("keydown",e=>{if(e.target.matches("textarea")&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();enviarMensagem();}});
 panel._parts={tabs,search,list,conversation};
}
function formatarData(v){if(!v)return "";const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
async function abrirChat(){
 try{state.carregando=true;render();const [cfg,cs,cv]=await Promise.all([api("/configuracao"),api("/conversas"),api("/contatos")]);state.config=cfg;window.__hauyChatUsuarioID=cfg.usuarioID;state.conversas=cs.conversas||[];state.contatos=cv.contatos||[];state.aba="conversas";render();}
 catch(e){mostrarErro(e.message);}
}
function mostrarErro(msg){const c=document.querySelector(".hauy-chat-conversa");if(c){c.replaceChildren(el("p","hauy-chat-vazio",msg));}}
function render(){
 const panel=document.querySelector(".hauy-chat-painel");if(!panel)return;const p=panel._parts;
 p.tabs.replaceChildren();const abas=[["conversas","Conversas"],["contatos","Contatos"]];if(state.config.podeAlterar)abas.push(["solicitacoes","Solicitações"],["bloqueios","Bloqueios"],["config","Config."]);
 abas.forEach(([id,nome])=>{const b=el("button",state.aba===id?"ativo":"",nome);b.type="button";b.dataset.aba=id;p.tabs.append(b);});
 p.search.hidden=state.aba==="solicitacoes"||state.aba==="bloqueios"||state.aba==="config";p.search.value="";
 renderLista();renderConversa();
}
function renderLista(){
 const p=document.querySelector(".hauy-chat-painel")?document.querySelector(".hauy-chat-painel")._parts:null;if(!p)return;p.list.replaceChildren();
 let dados=state.aba==="contatos"?state.contatos:state.aba==="solicitacoes"?state.solicitacoes:state.aba==="bloqueios"?state.bloqueios:state.conversas;
 const q=p.search.value.trim().toLocaleLowerCase("pt-BR");if(q)dados=dados.filter(x=>(x.nome||x.solicitante?.nome||x.contato?.nome||"").toLocaleLowerCase("pt-BR").includes(q));
 if(!dados.length){p.list.append(el("p","hauy-chat-vazio",state.aba==="conversas"?"Nenhuma conversa por enquanto.":state.aba==="contatos"?"Nenhum contato encontrado.":state.aba==="solicitacoes"?"Nenhuma solicitação pendente.":"Nenhum usuário bloqueado."));return;}
 dados.forEach(item=>{
  const id=state.aba==="solicitacoes"?item.id:state.aba==="bloqueios"?item.usuarioID:state.aba==="contatos"?item.id:item.id;
  const nome=state.aba==="solicitacoes"?item.solicitante?.nome:state.aba==="bloqueios"?item.nome:state.aba==="contatos"?item.nome:item.contato?.nome;
  const sub=state.aba==="solicitacoes"?"Solicitação de conversa":state.aba==="bloqueios"?"Bloqueado pelo ADM":state.aba==="contatos"?(item.tipoUsuario||"Usuário"):(item.ultimaMensagem||item.status||"Conversa");
  const b=el("button","hauy-chat-item"+(state.conversa?.id===id?" selecionado":""));b.type="button";b.dataset.id=id;
  b.append(el("span","hauy-chat-avatar",(nome||"U").trim().charAt(0).toUpperCase()));const t=el("span","hauy-chat-item-texto");t.append(el("strong","",nome||"Usuário"),el("small","",sub));b.append(t);
  if(state.aba==="solicitacoes"){const actions=el("span");["ACEITAR","RECUSAR"].forEach(a=>{const x=el("button","hauy-chat-acao",a==="ACEITAR"?"Aceitar":"Recusar");x.type="button";x.dataset.acao=a;x.dataset.id=item.id;actions.append(x);});b.append(actions);}
  p.list.append(b);
 });
}
function renderConversa(){
 const c=document.querySelector(".hauy-chat-painel")._parts.conversation;c.replaceChildren();
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
 if(state.conversa.status==="ACTIVE"){const form=el("form","hauy-chat-compositor"),area=el("textarea");area.maxLength=2000;area.rows=1;area.placeholder="Escreva uma mensagem...";const send=el("button","hauy-chat-btn","Enviar");send.type="button";send.dataset.acao="enviar";form.append(area,send);c.append(form);messages.scrollTop=messages.scrollHeight;}
 else c.append(el("div","hauy-chat-alerta",state.conversa.status==="PENDING"?"Sua solicitação foi enviada. Aguarde o ADM aceitar.":"Esta solicitação foi recusada. Você pode iniciar uma nova solicitação pelo contato do ADM."));
}
async function selecionarConversa(id){try{const item=state.conversas.find(x=>x.id===id);if(!item)return;state.conversa=item;const r=await api("/conversas/"+encodeURIComponent(id)+"/mensagens");state.mensagens=r.mensagens||[];render();}catch(e){mostrarErro(e.message);}}
async function iniciarConversa(id){const contato=state.contatos.find(x=>x.id===id);if(!contato)return;const mensagem=window.prompt("Escreva a primeira mensagem para "+contato.nome+":");if(!mensagem||!mensagem.trim())return;try{const r=await api("/conversas",{method:"POST",body:JSON.stringify({destinatarioID:id,mensagem:mensagem.trim()})});await abrirChat();const item=state.conversas.find(x=>x.id===r.conversaID);if(item)selecionarConversa(item.id);else mostrarErro(r.mensagem);}catch(e){mostrarErro(e.message);}}
async function enviarMensagem(){const c=document.querySelector(".hauy-chat-painel")._parts.conversation;const area=c.querySelector("textarea");const mensagem=area?.value.trim();if(!mensagem||!state.conversa)return;const btn=c.querySelector('[data-acao="enviar"]');btn.disabled=true;try{await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/mensagens",{method:"POST",body:JSON.stringify({mensagem})});const r=await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/mensagens");state.mensagens=r.mensagens||[];await atualizarConversas();render();}catch(e){mostrarErro(e.message);}finally{btn.disabled=false;}}
async function atualizarConversas(){const r=await api("/conversas");state.conversas=r.conversas||[];if(state.conversa)state.conversa=state.conversas.find(x=>x.id===state.conversa.id)||state.conversa;}
async function silenciar(){try{const valor=!state.conversa.silenciado;await api("/conversas/"+encodeURIComponent(state.conversa.id)+"/silenciar",{method:"PATCH",body:JSON.stringify({silenciado:valor})});state.conversa.silenciado=valor;render();}catch(e){mostrarErro(e.message);}}
async function bloquear(){if(!state.config.podeAlterar||!state.conversa)return;const id=state.conversa.contato?.id;if(!id||!confirm("Bloquear este usuário no chat? Ele não poderá mais encontrar o ADM nem acessar conversas com o administrador."))return;try{await api("/bloqueios",{method:"POST",body:JSON.stringify({usuarioID:id})});state.conversa=null;await abrirChat();}catch(e){mostrarErro(e.message);}}
async function responderSolicitacao(id,acao){if(!acao)return;try{await api("/solicitacoes/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({acao})});await carregarSolicitacoes();await atualizarConversas();render();}catch(e){mostrarErro(e.message);}}
async function alternarModoRestrito(){try{const ativo=!state.config.modoRestritoADM;const r=await api("/configuracao/modo-restrito",{method:"PATCH",body:JSON.stringify({ativo})});state.config.modoRestritoADM=r.modoRestritoADM;render();}catch(e){mostrarErro(e.message);}}
async function carregarSolicitacoes(){const [s,b]=await Promise.all([api("/solicitacoes"),api("/bloqueios")]);state.solicitacoes=s.solicitacoes||[];state.bloqueios=b.bloqueios||[];}
document.addEventListener("DOMContentLoaded",async()=>{try{const r=await api("/configuracao");state.config=r;window.__hauyChatUsuarioID=r.usuarioID;criarInterface();if(r.podeAlterar){try{await carregarSolicitacoes();}catch{}}}catch(e){console.info("Chat indisponível nesta sessão:",e.message);}});
})();
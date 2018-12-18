import config from '../../config'
import { parseText } from '../text-parser'
import { genEvents, addHandler } from './events'
import { genModel } from './model'
import { getAndRemoveAttr } from './helpers'

const bindRE = /^:|^v-bind:/
const onRE = /^@|^v-on:/
const dirRE = /^v-/
// 以下属性为特殊属性
const mustUsePropsRE = /^(value|selected|checked|muted)$/

/**
 * @description 解析AST语法树为render函数
 * @param {Object} ast AST语法树对象
 * @returns {Function} render函数
 */
export function generate (ast) {
  // 从根节点（容器节点）开始解析
  const code = genElement(ast)
  return new Function (`with (this) { return ${code}}`)
}

// 元素节点解析
function genElement (el, key) {
  let exp
  if (exp = getAndRemoveAttr(el, 'v-for')) { // 解析v-for指令
    return genFor(el, exp)
  } else if (exp = getAndRemoveAttr(el, 'v-if')) { // 解析v-if指令
    return genIf(el, exp)
  } else if (el.tag === 'template') { // 解析子组件
    return genChildren(el)
  } else {
    return `__h__('${el.tag}', ${genData(el, key) }, ${genChildren(el)})`
  }
}

// 解析v-if指令
function genIf (el, exp) {
  return `(${exp}) ? ${genElement(el)} : null`
}

// 解析v-for指令
function genFor (el, exp) {
  const inMatch = exp.match(/([a-zA-Z_][\w]*)\s+(?:in|of)\s+(.*)/)
  if (!inMatch) {
    throw new Error('Invalid v-for expression: '+ exp)
  }
  const alias = inMatch[1].trim()
  exp = inMatch[2].trim()
  let key = getAndRemoveAttr(el, 'track-by') // 后面用 :key 代替了 track-by
  if (!key) {
    key ='undefined'
  } else if (key !== '$index') {
    key = alias + '["' + key + '"]'
  }
  return `(${exp}) && (${exp}).map(function (${alias}, $index) {return ${genElement(el, key)}})`
}

// 属性解析
function genData (el, key) {
  if (!el.attrs.length) {
    return '{}'
  }
  let data = '{'
  if (key) {
    data += `key:${key},`
  }
  // 解析动态class
  const classBinding = getAndRemoveAttr(el, ':class') || getAndRemoveAttr(el, 'v-bind:class')
  if (classBinding) {
    data += `class: ${classBinding},`
  }
  // 解析静态class
  const staticClass = getAndRemoveAttr(el, 'class')
  if (staticClass) {
    data += `staticClass: "${staticClass}",`
  }
  let attrs = `attrs:{`
  let props = `props:{`
  let events = {}
  let hasAttrs = false
  let hasProps = false
  let hasEvents = false
  
  if (el.props) {
    hasProps = true
    props += el.props + ','
  }

  // 遍历解析其他属性
  for (let i = 0, l = el.attrs.length; i < l; i++) {
    let attr = el.attrs[i]
    let name = attr.name
    let value = attr.value
    if (bindRE.test(name)) {  // 处理v-bind指令
      name = name.replace(bindRE, '')
      if (name === 'style') {
        data += `style: ${value},`
      } else if (mustUsePropsRE.test(name)) {
        hasProps = true
        props += `"${name}": (${value}),`
      } else {
        hasAttrs = true
        attrs += `"${name}": (${value}),`
      }
    } else if (onRE.test(name)) { // 处理v-on指令
      hasEvents = true
      name = name.replace(onRE, '')
      addHandler(events, name, value)
    } else if (name === 'v-model') { // 处理v-model指令
      hasProps = hasEvents = true
      props += genModel(el, events, value) + ','
    } else if (dirRE.test(name)) {
      // TODO: normal directives
    } else { // 处理普通属性
      hasAttrs = true
      attrs += `"${name}": (${JSON.stringify(attr.value)}),`
    }
  }
  if (hasAttrs) {
    data += attrs.slice(0, -1) + '},'
  }
  if (hasProps) {
    data += props.slice(0, -1) + '},'
  }
  if (hasEvents) {
    data += genEvents(events) // 事件解析
  }
  return data.replace(/,$/, '') + '}'
}

// 解析子节点
function genChildren (el) {
  if (!el.children.length) {
    return 'undefined'
  }
  return '[' + el.children.map(genNode).join(',') + ']'
}

// 节点解析
function genNode (node) {
  if (node.tag) {
    return genElement(node)
  } else {
    return genText(node)
  }
}

// 文本节点解析
function genText (text) {
  if (text === ' ') {
    return '" "'
  } else {
    const exp = parseText(text)
    if (exp) {
      return 'String(' + exp + ')'
    } else {
      return JSON.stringify(text)
    }
  }
}